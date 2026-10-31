import { handle, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

/** Historique des paiements de l'utilisateur (tous rôles). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const payments = await db.payment.findMany({
      where: { payerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lease: { include: { listing: { select: { title: true } } } }, booking: { include: { listing: { select: { title: true } } } } },
    });
    return ok(payments.map((p) => ({
      id: p.id, reference: p.reference, purpose: p.purpose, amount: p.amount, method: p.method,
      status: p.status, createdAt: p.createdAt, confirmedAt: p.confirmedAt,
      breakdownJson: p.breakdownJson,
      leaseRef: p.lease?.reference ?? null,
      bookingRef: p.booking?.code ?? null,
      label: p.lease?.listing?.title ?? p.booking?.listing?.title ?? (p.purpose === "SUBSCRIPTION" ? "Abonnement" : "Paiement"),
      quittanceUrl: p.purpose === "RENT" && p.status === "SUCCESS" ? `/api/pdf/quittance/${p.id}` : null,
      receiptUrl: p.status === "SUCCESS" ? `/api/pdf/quittance/${p.id}` : null,
    })));
  });
}
