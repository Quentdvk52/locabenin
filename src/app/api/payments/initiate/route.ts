import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, fail, ApiError } from "@/lib/api";
import { initiatePayment } from "@/lib/payments";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { computeCommission, normalizeToMonthly, initialPaymentBreakdown, sumLines, bookingTotal } from "@/lib/finance";
import { activeAttribution } from "@/lib/affiliate";
import { PERIOD_MONTHS, type RentPeriod } from "@/lib/constants";

const schema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("INITIAL"),
    leaseId: z.string(),
    method: z.enum(["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH", "CARD"]),
  }),
  z.object({
    purpose: z.literal("RENT"),
    scheduleId: z.string(),
    method: z.enum(["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH", "CARD"]),
  }),
  z.object({
    purpose: z.literal("BOOKING"),
    bookingId: z.string(),
    method: z.enum(["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH", "CARD"]),
  }),
  z.object({
    purpose: z.literal("SUBSCRIPTION"),
    invoiceId: z.string(),
    method: z.enum(["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH", "CARD"]),
  }),
]);

/**
 * Point d'entrée unifié de paiement.
 * - INITIAL : caution + avances + cautions optionnelles + part démarcheur
 *   (affichée au locataire AVANT validation, jamais ajoutée en cachette).
 * - RENT / BOOKING / SUBSCRIPTION : montants contrôlés serveur (anti-tamper).
 * Le montant est TOUJOURS recalculé serveur à partir des entités — jamais
 * lu depuis le client.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`pay:${user.id}`, RATE_LIMITS.payment.limit, RATE_LIMITS.payment.windowMs)) {
      throw new ApiError(429, "Trop de tentatives de paiement. Patientez une minute.");
    }
    const body = await parseBody(req, schema);
    const settings = await getSettings();

    if (body.purpose === "INITIAL") {
      const lease = await db.lease.findUnique({ where: { id: body.leaseId }, include: { listing: true, tenant: true } });
      if (!lease || lease.tenantId !== user.id) return fail(404, "Bail introuvable.");
      if (lease.status !== "ACTIVE") throw new ApiError(400, "Ce bail n'est pas en attente de paiement.");
      const existing = await db.payment.findFirst({ where: { leaseId: lease.id, purpose: "INITIAL", status: { in: ["PENDING", "SUCCESS"] } } });
      if (existing?.status === "SUCCESS") throw new ApiError(400, "Le paiement d'entrée est déjà réglé.");
      const options = (JSON.parse(lease.depositOptionsJson ?? "[]")) as Array<{ label: string; amount: number }>;
      const lines = initialPaymentBreakdown({
        rentAmount: lease.rentAmount, rentPeriod: lease.rentPeriod as RentPeriod,
        depositAmount: lease.depositAmount, advanceMonths: lease.advanceMonths,
        depositOptions: options,
        commissionTenantShare: lease.commissionTenantShare,
      });
      const total = sumLines(lines);
      const { payment, mockConfirmToken } = await initiatePayment({
        payerId: user.id, purpose: "INITIAL", amount: total, method: body.method,
        description: `Paiement d'entrée — ${lease.listing.title}`,
        leaseId: lease.id, breakdown: lines,
      });
      return ok({ payment: { id: payment.id, reference: payment.reference, amount: payment.amount, status: payment.status }, mockConfirmToken, breakdown: lines });
    }

    if (body.purpose === "RENT") {
      const schedule = await db.rentSchedule.findUnique({ where: { id: body.scheduleId }, include: { lease: { include: { listing: true } } } });
      if (!schedule || schedule.lease.tenantId !== user.id) return fail(404, "Échéance introuvable.");
      if (schedule.status === "PAID") throw new ApiError(400, "Cette échéance est déjà payée.");
      const remaining = schedule.amount - schedule.paidAmount;
      const { payment, mockConfirmToken } = await initiatePayment({
        payerId: user.id, purpose: "RENT", amount: remaining, method: body.method,
        description: `Loyer — ${schedule.lease.listing.title}`,
        leaseId: schedule.leaseId, scheduleId: schedule.id,
        breakdown: [{ label: `Loyer période du ${schedule.dueDate.toLocaleDateString("fr-FR")}`, amount: remaining }],
      });
      return ok({ payment: { id: payment.id, reference: payment.reference, amount: payment.amount, status: payment.status }, mockConfirmToken });
    }

    if (body.purpose === "BOOKING") {
      const booking = await db.booking.findUnique({ where: { id: body.bookingId }, include: { listing: true } });
      if (!booking || booking.tenantId !== user.id) return fail(404, "Réservation introuvable.");
      if (booking.status !== "PENDING_PAYMENT") throw new ApiError(400, "Cette réservation a déjà été traitée.");
      const { payment, mockConfirmToken } = await initiatePayment({
        payerId: user.id, purpose: "BOOKING", amount: booking.totalAmount, method: body.method,
        description: `Réservation ${booking.code} — ${booking.listing.title}`,
        bookingId: booking.id, breakdown: [{ label: `Séjour de ${booking.nights} nuit(s)`, amount: booking.totalAmount }],
      });
      return ok({ payment: { id: payment.id, reference: payment.reference, amount: payment.amount, status: payment.status }, mockConfirmToken });
    }

    // SUBSCRIPTION
    const invoice = await db.subscriptionInvoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice || invoice.ownerId !== user.id) return fail(404, "Facture introuvable.");
    if (invoice.status === "PAID") throw new ApiError(400, "Cette facture est déjà payée.");
    const { payment, mockConfirmToken } = await initiatePayment({
      payerId: user.id, purpose: "SUBSCRIPTION", amount: invoice.amount, method: body.method,
      description: "Abonnement LocaBénin — publication d'offres",
      invoiceId: invoice.id, breakdown: (JSON.parse(invoice.lineItemsJson) as Array<{ label: string; price: number }>).map((li) => ({ label: li.label, amount: li.price })),
    });
    return ok({ payment: { id: payment.id, reference: payment.reference, amount: payment.amount, status: payment.status }, mockConfirmToken });
  });
}
