import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const createSchema = z.object({
  listingId: z.string(),
  scheduledAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

/** Demande de visite (locataire) / liste (selon rôle actif). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`visit:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de demandes envoyées, patientez un peu.");
    }
    const body = await parseBody(req, createSchema);
    const listing = await db.listing.findUnique({ where: { id: body.listingId } });
    if (!listing) return fail(404, "Offre introuvable.");
    if (listing.ownerId === user.id) throw new ApiError(400, "Vous ne pouvez pas demander une visite de votre propre offre.");
    const visit = await db.visit.create({
      data: { listingId: listing.id, tenantId: user.id, ownerId: listing.ownerId, scheduledAt: new Date(body.scheduledAt), note: body.note },
    });
    await sendNotification({
      userId: listing.ownerId, type: "VISIT",
      title: "Nouvelle demande de visite",
      body: `${user.fullName} souhaite visiter « ${listing.title} » le ${new Date(body.scheduledAt).toLocaleString("fr-FR")}.`,
      linkHash: "#/proprietaire/visites",
    });
    return ok(visit);
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const isOwner = user.activeRole === "OWNER" || user.isAdmin;
    const visits = await db.visit.findMany({
      where: isOwner && !user.isAdmin ? { ownerId: user.id } : user.isAdmin ? {} : { tenantId: user.id },
      orderBy: { scheduledAt: "desc" },
      take: 60,
      include: { listing: { select: { id: true, title: true, reference: true } }, tenant: { select: { id: true, fullName: true, phone: true } } },
    });
    return ok(visits);
  });
}

const updateSchema = z.object({ id: z.string(), status: z.enum(["CONFIRMED", "REJECTED", "CANCELLED", "DONE"]) });

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { id, status } = await parseBody(req, updateSchema);
    const visit = await db.visit.findUnique({ where: { id }, include: { listing: true } });
    if (!visit) return fail(404, "Visite introuvable.");
    const isOwner = visit.ownerId === user.id;
    const isTenant = visit.tenantId === user.id;
    if (!isOwner && !isTenant) throw new ApiError(403, "Accès refusé.");
    if (!isOwner && !["CANCELLED"].includes(status)) throw new ApiError(403, "Seul le propriétaire peut confirmer/refuser/terminer.");
    await db.visit.update({ where: { id }, data: { status } });
    if (isOwner) {
      await sendNotification({
        userId: visit.tenantId, type: "VISIT", title: `Visite ${status === "CONFIRMED" ? "confirmée" : status === "REJECTED" ? "refusée" : status === "DONE" ? "effectuée" : "annulée"}`,
        body: `« ${visit.listing.title} » — ${new Date(visit.scheduledAt).toLocaleString("fr-FR")}.`,
        linkHash: "#/locataire/candidatures",
      });
    }
    return ok({ updated: true });
  });
}
