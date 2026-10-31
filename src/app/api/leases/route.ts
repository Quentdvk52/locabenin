import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { commissionForLease, monthlyRentOf } from "@/lib/affiliate";
import { generateRentSchedule } from "@/lib/finance";
import { sendNotification } from "@/lib/notifications";
import { getVisitorId } from "@/lib/auth";
import { activeAttribution } from "@/lib/affiliate";

const createSchema = z.object({
  applicationId: z.string(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  leaseMonths: z.number().int().min(1).max(60).optional(),
  allowPartial: z.boolean().default(false),
});

/**
 * Création d'un bail par le propriétaire après ACCEPTATION d'une candidature.
 * C'est ici que la règle métier démarcheur s'applique :
 *  • attribution = dernier clic valide du locataire sur l'offre (cookie visiteur,
 *    fenêtre 30 j par défaut) ;
 *  • commission totale = ½ mois de loyer, 25 % locataire + 25 % propriétaire ;
 *  • parts figées dans le bail au moment de la création.
 * L'échéancier de loyer est généré selon la périodicité.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    const body = await parseBody(req, createSchema);

    const application = await db.application.findUnique({
      where: { id: body.applicationId },
      include: { listing: { include: { depositOptions: true } }, tenant: true },
    });
    if (!application) return fail(404, "Candidature introuvable.");
    if (application.listing.ownerId !== user.id) throw new ApiError(403, "Cette candidature ne concerne pas une de vos offres.");
    if (application.status !== "ACCEPTED") throw new ApiError(400, "Acceptez d'abord la candidature avant de créer le bail.");
    if (application.leaseId) throw new ApiError(400, "Un bail existe déjà pour cette candidature.");

    const listing = application.listing;
    if (listing.genre === "FURNISHED") throw new ApiError(400, "Pour un meublé, utilisez la réservation en ligne (calendrier).");

    const settings = await getSettings();
    const startDate = new Date(body.startDate);
    const leaseMonths = body.leaseMonths ?? (listing.rentPeriod === "LEASE" ? 12 : listing.rentPeriod === "QUARTER" ? 3 : listing.rentPeriod === "SEMESTER" ? 6 : 12);
    const endDate = new Date(startDate.getTime() + leaseMonths * 30.44 * 86400_000);

    // ---- Attribution démarcheur (dernier clic prime, paramétrable) ----
    const visitorId = await getVisitorId();
    const attribution = visitorId ? await activeAttribution(visitorId) : null;
    let affiliateLinkId: string | null = null;
    let commission = null as null | { total: number; tenantShare: number; ownerShare: number };
    if (listing.affiliateEnabled && attribution && attribution.link.listingId === listing.id) {
      // Anti-fraude : le locataire ne peut pas être le démarcheur lui-même
      if (application.tenantId !== attribution.agentId && application.tenantId !== listing.ownerId) {
        affiliateLinkId = attribution.linkId;
        commission = commissionForLease(
          { monthlyRent: monthlyRentOf(listing.rentAmount, listing.rentPeriod as never), leaseMonths, kind: "SIMPLE" },
          settings,
        );
      }
    }

    const lease = await db.lease.create({
      data: {
        reference: `BAIL-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
        listingId: listing.id, ownerId: listing.ownerId, tenantId: application.tenantId,
        kind: "SIMPLE",
        startDate, endDate,
        rentAmount: listing.rentAmount, rentPeriod: listing.rentPeriod,
        depositAmount: listing.depositAmount, advanceMonths: listing.advanceMonths,
        depositOptionsJson: JSON.stringify(listing.depositOptions ?? (await db.depositOption.findMany({ where: { listingId: listing.id } })).map((d) => ({ label: d.label, amount: d.amount }))),
        affiliateLinkId, 
        commissionTotal: commission?.total ?? 0,
        commissionTenantShare: commission?.tenantShare ?? 0,
        commissionOwnerShare: commission?.ownerShare ?? 0,
        allowPartial: body.allowPartial,
        status: "ACTIVE",
      },
    });
    await db.application.update({ where: { id: application.id }, data: { leaseId: lease.id } });

    // Échéancier de loyer (recharges à chaque période)
    const monthlyRent = monthlyRentOf(listing.rentAmount, listing.rentPeriod as never);
    const schedules = generateRentSchedule({ startDate, endDate, monthlyRent, period: listing.rentPeriod as never });
    await db.rentSchedule.createMany({ data: schedules.map((s) => ({ leaseId: lease.id, dueDate: s.dueDate, amount: s.amount })) });

    // Contrat PDF (non signé à ce stade — signature électronique des deux parties)
    await db.lease.update({ where: { id: lease.id }, data: { contractPdfUrl: `/api/pdf/contract/${lease.id}` } });

    await sendNotification({
      userId: application.tenantId, type: "APPLICATION",
      title: "Votre candidature a été acceptée",
      body: `Le propriétaire a créé le bail ${lease.reference} pour « ${listing.title} ». Réglez le paiement d'entrée pour activer votre location.`,
      linkHash: "#/locataire/bail",
    });

    return ok({
      lease: { id: lease.id, reference: lease.reference },
      commission,
      schedulesCount: schedules.length,
    });
  });
}

/** Baux de l'utilisateur selon son rôle actif (propriétaire = les siens, locataire = les siens). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const isOwner = user.activeRole === "OWNER" || user.isAdmin;
    const leases = await db.lease.findMany({
      where: isOwner && !user.isAdmin ? { ownerId: user.id } : user.isAdmin ? {} : { tenantId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        listing: { select: { id: true, title: true, reference: true, type: true, genre: true } },
        owner: { select: { id: true, fullName: true, phone: true, kycStatus: true } },
        tenant: { select: { id: true, fullName: true, phone: true, kycStatus: true } },
        schedules: { orderBy: { dueDate: "asc" }, take: 12 },
      },
    });
    // Passage des échéances échues en LATE (évaluation à la volée)
    const now = new Date();
    for (const lease of leases) {
      for (const s of lease.schedules) {
        if (s.status === "PENDING" && s.dueDate < now) {
          await db.rentSchedule.update({ where: { id: s.id }, data: { status: "LATE" } });
          s.status = "LATE";
        }
      }
    }
    return ok(leases);
  });
}
