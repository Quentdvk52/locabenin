import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getVisitorId } from "@/lib/auth";
import { activeAttribution } from "@/lib/affiliate";

const createSchema = z.object({
  listingId: z.string(),
  message: z.string().max(1000).optional(),
});

/** Candidature d'un locataire à une offre. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`apply:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de candidatures envoyées, patientez un peu.");
    }
    const body = await parseBody(req, createSchema);
    const listing = await db.listing.findUnique({ where: { id: body.listingId } });
    if (!listing || listing.status !== "PUBLISHED") return fail(404, "Offre non disponible.");
    if (listing.ownerId === user.id) throw new ApiError(400, "Candidature à votre propre offre impossible.");
    const dup = await db.application.findFirst({ where: { listingId: listing.id, tenantId: user.id, status: "PENDING" } });
    if (dup) throw new ApiError(409, "Vous avez déjà une candidature en attente sur cette offre.");

    // Attribution au moment de la candidature (sécurisée côté serveur : cookie visiteur)
    const visitorId = await getVisitorId();
    const attribution = visitorId ? await activeAttribution(visitorId) : null;
    const application = await db.application.create({
      data: {
        listingId: listing.id, tenantId: user.id, message: body.message,
        affiliateLinkId: attribution && attribution.listingId === listing.id ? attribution.linkId : null,
        visitorId,
      },
    });
    await sendNotification({
      userId: listing.ownerId, type: "APPLICATION",
      title: "Nouvelle candidature",
      body: `${user.fullName} souhaite louer « ${listing.title} ».`,
      linkHash: "#/proprietaire/visites",
    });
    return ok(application);
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const isOwner = user.activeRole === "OWNER" || user.isAdmin;
    const applications = await db.application.findMany({
      where: isOwner && !user.isAdmin ? { listing: { ownerId: user.id } } : user.isAdmin ? {} : { tenantId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        listing: { select: { id: true, title: true, reference: true, rentAmount: true, rentPeriod: true, depositAmount: true, advanceMonths: true, genre: true } },
        tenant: { select: { id: true, fullName: true, phone: true, kycStatus: true, createdAt: true } },
      },
    });
    return ok(applications);
  });
}

const decideSchema = z.object({ id: z.string(), status: z.enum(["ACCEPTED", "REJECTED", "WITHDRAWN"]) });

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { id, status } = await parseBody(req, decideSchema);
    const application = await db.application.findUnique({ where: { id }, include: { listing: true } });
    if (!application) return fail(404, "Candidature introuvable.");
    const isOwner = application.listing.ownerId === user.id;
    const isTenant = application.tenantId === user.id;
    if (!isOwner && !isTenant) throw new ApiError(403, "Accès refusé.");
    if (!isOwner && status !== "WITHDRAWN") throw new ApiError(403, "Seul le propriétaire décide.");
    await db.application.update({ where: { id }, data: { status, decidedAt: new Date() } });
    if (isOwner) {
      await sendNotification({
        userId: application.tenantId, type: "APPLICATION",
        title: status === "ACCEPTED" ? "Candidature acceptée" : "Candidature refusée",
        body: `« ${application.listing.title} » — ${status === "ACCEPTED" ? "le propriétaire vous attend pour la création du bail." : "d'autres offres sont disponibles sur LocaBénin."}`,
        linkHash: "#/locataire/candidatures",
      });
    }
    return ok({ updated: true });
  });
}
