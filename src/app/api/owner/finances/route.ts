import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { walletBalance, walletStatement } from "@/lib/ledger";

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Finances propriétaire : portefeuille (solde dérivé du ledger), relevé,
 * retraits, revenus du mois, série 12 mois pour le graphique d'encaissements
 * et historique des paiements reçus (quittances incluses).
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const now = new Date();
    const monthStart = startOfMonth(now);
    const yearAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 11, 1);

    const [balance, statement, payouts, settings, monthAgg, yearPayments, received] = await Promise.all([
      walletBalance("OWNER", user.id),
      walletStatement("OWNER", user.id, 50),
      db.payout.findMany({ where: { userId: user.id, userRole: "OWNER" }, orderBy: { createdAt: "desc" }, take: 50 }),
      getSettings(),
      db.payment.aggregate({
        where: { status: "SUCCESS", confirmedAt: { gte: monthStart }, lease: { ownerId: user.id } },
        _sum: { amount: true },
      }),
      db.payment.findMany({
        where: { status: "SUCCESS", confirmedAt: { gte: yearAgo }, lease: { ownerId: user.id } },
        select: { amount: true, confirmedAt: true },
      }),
      db.payment.findMany({
        where: { lease: { ownerId: user.id }, status: { in: ["SUCCESS", "PENDING", "INITIATED", "FAILED"] } },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          lease: { select: { reference: true, listing: { select: { title: true } } } },
          payer: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    // Série mensuelle 12 mois (encaissements)
    const months: Array<{ key: string; label: string; total: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), total: 0 });
    }
    for (const p of yearPayments) {
      if (!p.confirmedAt) continue;
      const key = `${p.confirmedAt.getFullYear()}-${String(p.confirmedAt.getMonth() + 1).padStart(2, "0")}`;
      const row = months.find((m) => m.key === key);
      if (row) row.total += p.amount;
    }

    return ok({
      walletBalance: balance,
      walletStatement: statement,
      payouts,
      monthRevenue: monthAgg._sum.amount ?? 0,
      revenueSeries: months,
      receivedPayments: received.map((p) => ({
        id: p.id,
        reference: p.reference,
        purpose: p.purpose,
        amount: p.amount,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
        payer: p.payer,
        leaseReference: p.lease?.reference ?? null,
        listingTitle: p.lease?.listing?.title ?? null,
        quittanceUrl: p.status === "SUCCESS" ? `/api/pdf/quittance/${p.id}` : null,
      })),
      payoutSettings: { min: settings.payoutMinAmount, autoThreshold: settings.payoutAutoApprovalThreshold },
    });
  });
}
