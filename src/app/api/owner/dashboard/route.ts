import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureBillingCycle, subscriptionSummary } from "@/lib/subscription";

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

/**
 * Tableau de bord propriétaire — KPIs du mois, calculés SERVEUR :
 *  • revenus encaissés (paiements SUCCESS du mois sur les baux du propriétaire)
 *  • loyers attendus (échéances PENDING à venir) / en retard (LATE ou échues)
 *  • taux d'occupation (offres RENTED / total non archivées)
 *  • offres actives, visites à venir (7 j), candidatures en attente,
 *    messages non lus, abonnement (résumé temps réel)
 *  • graphique revenus 6 derniers mois + 5 prochaines échéances
 * Toutes les agrégations sont faites en une passe de requêtes parallèles.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const sixMonthsAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 5, 1);
    const in7Days = new Date(now.getTime() + 7 * 86400_000);

    const [
      monthPayments,
      prevPayments,
      sixMonthsPayments,
      schedules,
      listingCounts,
      upcomingVisits,
      pendingApplications,
      participations,
      subscription,
    ] = await Promise.all([
      // Revenus encaissés ce mois (liés aux baux du propriétaire)
      db.payment.aggregate({
        where: { status: "SUCCESS", confirmedAt: { gte: monthStart, lte: monthEnd }, lease: { ownerId: user.id } },
        _sum: { amount: true },
      }),
      // Mois précédent (trend)
      db.payment.aggregate({
        where: {
          status: "SUCCESS",
          confirmedAt: { gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1), lt: monthStart },
          lease: { ownerId: user.id },
        },
        _sum: { amount: true },
      }),
      // Série 6 mois pour le graphique
      db.payment.findMany({
        where: { status: "SUCCESS", confirmedAt: { gte: sixMonthsAgo }, lease: { ownerId: user.id } },
        select: { amount: true, confirmedAt: true },
      }),
      // Échéances (attendues / en retard / à venir)
      db.rentSchedule.findMany({
        where: { lease: { ownerId: user.id } },
        select: { amount: true, paidAmount: true, status: true, dueDate: true, leaseId: true },
      }),
      // Offres par statut
      db.listing.groupBy({
        by: ["status"],
        where: { ownerId: user.id, deletedAt: null },
        _count: { _all: true },
      }),
      // Visites à venir (7 j)
      db.visit.count({
        where: { ownerId: user.id, scheduledAt: { gte: now, lte: in7Days }, status: { in: ["REQUESTED", "CONFIRMED"] } },
      }),
      // Candidatures en attente
      db.application.count({ where: { listing: { ownerId: user.id }, status: "PENDING" } }),
      // Messages non lus (dernier message reçu après dernière lecture)
      db.conversationParticipant.findMany({
        where: { userId: user.id },
        select: {
          lastReadAt: true,
          conversation: { select: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { senderId: true, createdAt: true } } } },
        },
      }),
      // Abonnement (évalue le cycle courant puis résumé temps réel)
      (async () => {
        await ensureBillingCycle(user.id);
        return subscriptionSummary(user.id);
      })(),
    ]);

    // ---- Agrégations échéancier ----
    let expectedRent = 0;
    let lateRent = 0;
    for (const s of schedules) {
      const remaining = Math.max(0, s.amount - s.paidAmount);
      if (s.status === "LATE") lateRent += remaining;
      else if (s.status === "PENDING" || s.status === "PARTIAL") {
        if (s.dueDate < now) lateRent += remaining;
        else expectedRent += remaining;
      }
    }

    // ---- Offres ----
    const byStatus = Object.fromEntries(listingCounts.map((g) => [g.status, g._count._all]));
    const totalListings = listingCounts.reduce((a, g) => a + g._count._all, 0);
    const rented = byStatus["RENTED"] ?? 0;
    const activeListings = (byStatus["PUBLISHED"] ?? 0) + (byStatus["RESERVED"] ?? 0);
    const occupancyRate = totalListings > 0 ? Math.round((rented / totalListings) * 100) : 0;

    // ---- Messages non lus ----
    const unreadMessages = participations.filter((p) => {
      const last = p.conversation.messages[0];
      return last && last.senderId !== user.id && (!p.lastReadAt || last.createdAt > p.lastReadAt);
    }).length;

    // ---- Série mensuelle 6 mois ----
    const months: Array<{ key: string; label: string; total: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
        total: 0,
      });
    }
    for (const p of sixMonthsPayments) {
      if (!p.confirmedAt) continue;
      const key = `${p.confirmedAt.getFullYear()}-${String(p.confirmedAt.getMonth() + 1).padStart(2, "0")}`;
      const row = months.find((m) => m.key === key);
      if (row) row.total += p.amount;
    }

    // ---- Prochaines échéances (5) ----
    const nextSchedulesRaw = await db.rentSchedule.findMany({
      where: { lease: { ownerId: user.id }, status: { in: ["PENDING", "PARTIAL", "LATE"] }, dueDate: { gte: new Date(now.getTime() - 30 * 86400_000) } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { lease: { include: { listing: { select: { title: true } } } } },
    });

    const revenueThisMonth = monthPayments._sum.amount ?? 0;
    const revenuePrevMonth = prevPayments._sum.amount ?? 0;
    const trend = revenuePrevMonth > 0 ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100) : revenueThisMonth > 0 ? 100 : 0;

    return ok({
      kpis: {
        revenueThisMonth,
        revenuePrevMonth,
        trend,
        expectedRent,
        lateRent,
        occupancyRate,
        activeListings,
        totalListings,
        rentedCount: rented,
        pendingReviewCount: byStatus["PENDING_REVIEW"] ?? 0,
        suspendedUnpaidCount: byStatus["SUSPENDED_UNPAID"] ?? 0,
        upcomingVisits,
        pendingApplications,
        unreadMessages,
      },
      revenueSeries: months,
      nextSchedules: nextSchedulesRaw.map((s) => ({
        id: s.id,
        dueDate: s.dueDate,
        amount: s.amount,
        remaining: Math.max(0, s.amount - s.paidAmount),
        status: s.status,
        listingTitle: s.lease.listing.title,
        leaseId: s.leaseId,
      })),
      subscription: {
        total: subscription.total,
        lineItems: subscription.lineItems,
        currentInvoice: subscription.currentInvoice,
        hasOverdueBeyondGrace: subscription.hasOverdueBeyondGrace,
        graceDays: subscription.graceDays,
      },
    });
  });
}
