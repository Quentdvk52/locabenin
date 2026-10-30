import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { buildQuittancePdf, buildReceiptPdf } from "@/lib/pdf";
import { label } from "@/lib/constants";

/**
 * Quittance de loyer / reçu PDF — réservé aux parties du paiement
 * (payeur, propriétaire du bien concerné, admin).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ paymentId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { paymentId } = await ctx.params;
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        lease: { include: { listing: true, owner: true, tenant: true } },
        booking: { include: { listing: true } },
      },
    });
    if (!payment) return fail(404, "Paiement introuvable.");
    if (payment.status !== "SUCCESS") return fail(400, "Ce paiement n'est pas confirmé.");

    const isPayer = payment.payerId === user.id;
    const isOwner = payment.lease ? payment.lease.ownerId === user.id : false;
    if (!isPayer && !isOwner && !user.isAdmin) throw new ApiError(403, "Document réservé aux parties concernées.");

    const breakdown = payment.breakdownJson ? (JSON.parse(payment.breakdownJson) as Array<{ label: string; amount: number }>) : [{ label: label(payment.purpose), amount: payment.amount }];

    let pdf: Buffer;
    if (payment.purpose === "RENT" && payment.lease) {
      const lease = payment.lease;
      pdf = await buildQuittancePdf({
        paymentRef: payment.reference, leaseRef: lease.reference,
        tenantName: lease.tenant.fullName, ownerName: lease.owner.fullName,
        listingTitle: lease.listing.title,
        listingAddress: `${lease.listing.addressText ?? ""} ${lease.listing.areaId ? "" : ""}`.trim() || "Bénin",
        periodLabel: payment.scheduleId ? "Échéance en cours" : "Loyer",
        amount: payment.amount, paidAt: payment.confirmedAt ?? payment.createdAt, method: payment.method,
      });
    } else {
      const title = payment.lease ? payment.lease.listing.title : payment.booking ? payment.booking.listing.title : label(payment.purpose);
      pdf = await buildReceiptPdf({
        ref: payment.reference, title,
        payer: (await db.user.findUnique({ where: { id: payment.payerId } }))?.fullName ?? "—",
        amount: payment.amount, detail: breakdown, date: payment.confirmedAt ?? payment.createdAt,
      });
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quittance-${payment.reference}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
