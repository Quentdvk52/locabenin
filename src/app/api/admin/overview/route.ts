// ============================================================
// LocaBénin — GET /api/admin/overview
// Vue d'ensemble du back-office : KPIs utilisateurs / offres /
// paiements / abonnements / commissions / retraits / KYC /
// modération / signalements + intégrité du ledger + graphiques 14 j.
// ============================================================

import { NextRequest } from "next/server";
import { handle, ok, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { platformRevenue } from "@/lib/payments";
import { reconcileLedger } from "@/lib/ledger";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(_req: NextRequest) {
  return handle(async () => {
    await requireAdmin();

    const now = new Date();
    const monthStart = startOfMonth();
    const d14 = daysAgo(13);
    const d7 = daysAgo(6);

    const [
      usersTotal,
      usersNew7d,
      roleRows,
      listingRows,
      paymentsMonthRows,
      paymentsSuccess30d,
      invoicesMonth,
      commissionRows,
      payoutsPendingRows,
      reportsOpen,
      kycPending,
      pendingReview,
      payments14,
      signups14,
      revenue,
      ledger,
    ] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null, createdAt: { gte: d7 } } }),
      db.userRole.groupBy({ by: ["role"], _count: { _all: true } }),
      db.listing.groupBy({ by: ["status"], _count: { _all: true }, where: { deletedAt: null } }),
      db.payment.groupBy({ by: ["purpose"], _count: { _all: true }, _sum: { amount: true }, where: { status: "SUCCESS", confirmedAt: { gte: monthStart } } }),
      db.payment.count({ where: { status: "SUCCESS", createdAt: { gte: new Date(now.getTime() - 30 * 86400_000) } } }),
      db.subscriptionInvoice.findMany({ where: { periodStart: { gte: monthStart, lt: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1) } }, select: { status: true, amount: true } }),
      db.commission.groupBy({ by: ["status"], _count: { _all: true }, _sum: { total: true } }),
      db.payout.aggregate({ _count: { _all: true }, _sum: { amount: true }, where: { status: { in: ["OTP_PENDING", "REQUESTED"] } } }),
      db.report.count({ where: { status: "OPEN" } }),
      db.user.count({ where: { kycStatus: "PENDING", deletedAt: null } }),
      db.listing.count({ where: { status: "PENDING_REVIEW", deletedAt: null } }),
      db.payment.findMany({ where: { status: "SUCCESS", OR: [{ confirmedAt: { gte: d14 } }, { createdAt: { gte: d14 } }] }, select: { amount: true, confirmedAt: true, createdAt: true } }),
      db.user.findMany({ where: { createdAt: { gte: d14 } }, select: { createdAt: true } }),
      platformRevenue(),
      reconcileLedger(),
    ]);

    const byRole: Record<string, number> = {};
    for (const r of roleRows) byRole[r.role] = r._count._all;
    const byStatus: Record<string, number> = {};
    for (const r of listingRows) byStatus[r.status] = r._count._all;

    const monthByPurpose = paymentsMonthRows
      .map((r) => ({ purpose: r.purpose, count: r._count._all, total: r._sum.amount ?? 0 }))
      .sort((a, b) => b.total - a.total);
    const monthTotal = monthByPurpose.reduce((a, p) => a + p.total, 0);

    let mrrPaid = 0;
    let mrrDue = 0;
    for (const inv of invoicesMonth) {
      if (inv.status === "PAID") mrrPaid += inv.amount;
      else if (["DUE", "OVERDUE"].includes(inv.status)) mrrDue += inv.amount;
    }

    const commissionTotals: Record<string, { count: number; total: number }> = {};
    for (const r of commissionRows) {
      commissionTotals[r.status] = { count: r._count._all, total: r._sum.total ?? 0 };
    }

    // Séries journalières (14 derniers jours, trous à zéro)
    const series: string[] = [];
    for (let i = 13; i >= 0; i--) series.push(dayKey(daysAgo(i)));
    const labelOf = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
    };
    const paymentsByDay = new Map<string, { total: number; count: number }>();
    for (const p of payments14) {
      const key = dayKey(p.confirmedAt ?? p.createdAt);
      const cur = paymentsByDay.get(key) ?? { total: 0, count: 0 };
      cur.total += p.amount;
      cur.count += 1;
      paymentsByDay.set(key, cur);
    }
    const signupsByDay = new Map<string, number>();
    for (const u of signups14) signupsByDay.set(dayKey(u.createdAt), (signupsByDay.get(dayKey(u.createdAt)) ?? 0) + 1);

    return ok({
      users: { total: usersTotal, byRole, new7d: usersNew7d },
      listings: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
      payments: { successCount30d: paymentsSuccess30d, monthTotal, monthByPurpose },
      subscriptions: { mrrPaid, mrrDue },
      commissions: {
        pending: commissionTotals["PENDING_VALIDATION"] ?? { count: 0, total: 0 },
        validated: commissionTotals["VALIDATED"] ?? { count: 0, total: 0 },
        paid: commissionTotals["PAID"] ?? { count: 0, total: 0 },
      },
      payouts: { pendingCount: payoutsPendingRows._count._all, pendingAmount: payoutsPendingRows._sum.amount ?? 0 },
      reports: { open: reportsOpen },
      kyc: { pending: kycPending },
      moderation: { pendingReview },
      platform: { revenue, ledger },
      charts: {
        payments14d: series.map((k) => ({ date: k, label: labelOf(k), total: paymentsByDay.get(k)?.total ?? 0, count: paymentsByDay.get(k)?.count ?? 0 })),
        signups14d: series.map((k) => ({ date: k, label: labelOf(k), count: signupsByDay.get(k) ?? 0 })),
      },
      generatedAt: now.toISOString(),
    });
  });
}
