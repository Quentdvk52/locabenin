import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { formatFcfa } from "@/lib/finance";

/**
 * Mes locataires : baux du propriétaire avec infos locataire + bien,
 * statistiques d'échéancier (payé / attendu / en retard) et solde restant dû.
 * Les échéances PENDING échues sont basculées en LATE (évaluation à la volée).
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const leases = await db.lease.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        listing: { select: { id: true, title: true, reference: true, type: true, genre: true } },
        tenant: { select: { id: true, fullName: true, phone: true, kycStatus: true, createdAt: true } },
        schedules: { orderBy: { dueDate: "asc" } },
        _count: { select: { tickets: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
    });

    const now = new Date();
    const byStatus: Record<string, number> = {};
    let totalBalanceDue = 0;

    const tenants = leases.map((lease) => {
      byStatus[lease.status] = (byStatus[lease.status] ?? 0) + 1;
      let paidTotal = 0;
      let expectedTotal = 0;
      let lateCount = 0;
      let nextDue: Date | null = null;
      let nextAmount = 0;
      for (const s of lease.schedules) {
        expectedTotal += s.amount;
        paidTotal += s.paidAmount;
        const remaining = Math.max(0, s.amount - s.paidAmount);
        if (s.status === "PAID" || s.status === "WAIVED") continue;
        if (s.status === "LATE" || s.dueDate < now) lateCount++;
        else if (!nextDue || s.dueDate < nextDue) {
          nextDue = s.dueDate;
          nextAmount = remaining;
        }
      }
      const balanceDue = Math.max(0, expectedTotal - paidTotal);
      totalBalanceDue += balanceDue;

      return {
        leaseId: lease.id,
        leaseReference: lease.reference,
        leaseStatus: lease.status,
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentAmount: lease.rentAmount,
        rentPeriod: lease.rentPeriod,
        depositAmount: lease.depositAmount,
        depositReturnedAmount: lease.depositReturnedAmount,
        depositReturnedAt: lease.depositReturnedAt,
        commissionTotal: lease.commissionTotal,
        contractPdfUrl: lease.contractPdfUrl,
        allowPartial: lease.allowPartial,
        listing: lease.listing,
        tenant: lease.tenant,
        stats: {
          paidTotal,
          expectedTotal,
          balanceDue,
          lateCount,
          schedulesCount: lease.schedules.length,
          nextDueDate: nextDue,
          nextAmount,
          openTickets: lease._count.tickets,
          hasInitialPayment: true, // recalculé ci-dessous
        },
      };
    });

    // Paiement d'entrée effectué ? (par lot : tous les paiements INITIAL des baux)
    const initialPayments = await db.payment.findMany({
      where: { leaseId: { in: leases.map((l) => l.id) }, purpose: "INITIAL", status: "SUCCESS" },
      select: { leaseId: true },
    });
    const paidLeases = new Set(initialPayments.map((p) => p.leaseId));
    for (const t of tenants) t.stats.hasInitialPayment = paidLeases.has(t.leaseId);

    return ok({
      tenants,
      statsByStatus: byStatus,
      totalBalanceDue,
      totalBalanceDueLabel: formatFcfa(totalBalanceDue),
      count: tenants.length,
    });
  });
}
