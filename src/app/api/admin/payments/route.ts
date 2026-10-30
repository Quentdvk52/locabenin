// ============================================================
// LocaBénin — GET /api/admin/payments
// ?events=1 → 20 derniers payment_events (transparence du pipeline
//             webhook : idempotence, erreurs de traitement)
// sinon     → 50 derniers paiements (filtres status / purpose)
//             avec payeur + objet (bail, réservation, facture).
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseQuery, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";

const querySchema = z.object({
  status: z.string().trim().max(20).optional(),
  purpose: z.string().trim().max(20).optional(),
  events: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    if (q.events === "1") {
      const events = await db.paymentEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return ok({
        events: events.map((e) => ({
          id: e.id,
          provider: e.provider,
          eventId: e.eventId,
          type: e.type,
          signatureValid: e.signatureValid,
          processedAt: e.processedAt,
          processingError: e.processingError,
          createdAt: e.createdAt,
        })),
      });
    }

    const where = {
      ...(q.status && q.status !== "ALL" ? { status: q.status } : {}),
      ...(q.purpose && q.purpose !== "ALL" ? { purpose: q.purpose } : {}),
    };

    const take = q.take ?? 50;
    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
          payer: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
          lease: { select: { reference: true, listing: { select: { title: true } } } },
          booking: { select: { code: true, listing: { select: { title: true } } } },
        },
      }),
      db.payment.count({ where }),
    ]);

    // Payment n'a pas de relation Prisma vers SubscriptionInvoice (invoiceId seul) :
    // résolution manuelle des factures d'abonnement.
    const invoiceIds = payments.map((p) => p.invoiceId).filter((id): id is string => id !== null);
    const invoices = invoiceIds.length > 0
      ? await db.subscriptionInvoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, periodStart: true } })
      : [];
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    return ok({
      items: payments.map((p) => {
        let objectLabel = "—";
        if (p.lease) objectLabel = `Bail ${p.lease.reference} — ${p.lease.listing.title}`;
        else if (p.booking) objectLabel = `Réservation ${p.booking.code} — ${p.booking.listing.title}`;
        else if (p.invoiceId && invoiceById.has(p.invoiceId)) {
          objectLabel = `Facture d'abonnement ${monthLabel(invoiceById.get(p.invoiceId)!.periodStart)}`;
        } else if (p.scheduleId) objectLabel = "Échéance de loyer";

        let breakdown: Array<{ label: string; amount: number }> = [];
        if (p.breakdownJson) {
          try { breakdown = JSON.parse(p.breakdownJson) as Array<{ label: string; amount: number }>; } catch { /* détail illisible : ignoré */ }
        }

        return {
          id: p.id,
          reference: p.reference,
          purpose: p.purpose,
          amount: p.amount,
          method: p.method,
          status: p.status,
          provider: p.provider,
          failureReason: p.failureReason,
          refundedAmount: p.refundedAmount,
          createdAt: p.createdAt,
          confirmedAt: p.confirmedAt,
          payer: p.payer,
          objectLabel,
          breakdown,
        };
      }),
      total,
      take,
    });
  });
}
