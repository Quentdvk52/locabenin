import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Vue d'ensemble « prospects » : demandes de visite et candidatures récentes
 * combinées (pipeline commercial du propriétaire). Anti-IDOR par ownerId /
 * listing.ownerId.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const [visits, applications] = await Promise.all([
      db.visit.findMany({
        where: { ownerId: user.id },
        orderBy: { scheduledAt: "desc" },
        take: 15,
        include: {
          listing: { select: { id: true, title: true } },
          tenant: { select: { id: true, fullName: true } },
        },
      }),
      db.application.findMany({
        where: { listing: { ownerId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          listing: { select: { id: true, title: true } },
          tenant: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    return ok({
      visits: visits.map((v) => ({
        kind: "VISIT" as const,
        id: v.id,
        listingId: v.listing.id,
        listingTitle: v.listing.title,
        tenantId: v.tenant.id,
        tenantName: v.tenant.fullName,
        date: v.scheduledAt,
        status: v.status,
        note: v.note,
      })),
      applications: applications.map((a) => ({
        kind: "APPLICATION" as const,
        id: a.id,
        listingId: a.listing.id,
        listingTitle: a.listing.title,
        tenantId: a.tenant.id,
        tenantName: a.tenant.fullName,
        date: a.createdAt,
        status: a.status,
        message: a.message,
        hasLease: Boolean(a.leaseId),
      })),
    });
  });
}
