import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Tickets de réparation DU propriétaire (lecture).
 * Variante propriétaire de GET /api/tickets : le modèle MaintenanceTicket
 * n'a pas de relation Prisma vers Listing (listingId seul) → titre du bien
 * résolu par une seconde requête (anti-erreur d'inclusion).
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const tickets = await db.maintenanceTicket.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        tenant: { select: { fullName: true, phone: true } },
        updates: { orderBy: { createdAt: "asc" } },
      },
    });

    const listingIds = [...new Set(tickets.map((t) => t.listingId))];
    const listings = listingIds.length
      ? await db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } })
      : [];
    const titleById = new Map(listings.map((l) => [l.id, l.title]));

    return ok(
      tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        listingTitle: titleById.get(t.listingId) ?? "Bien retiré",
        tenant: t.tenant,
        photos: JSON.parse(t.photosJson) as string[],
        updates: t.updates.map((u) => ({
          id: u.id,
          authorId: u.authorId,
          body: u.body,
          statusAfter: u.statusAfter,
          createdAt: u.createdAt,
        })),
      })),
    );
  });
}
