// ============================================================
// LocaBénin — /api/admin/listings (modération des offres)
// GET   ?status=PENDING_REVIEW (file) | tout statut
//       ?duplicates=1 → groupes de doublons (même propriétaire +
//       titre normalisé) avec ≥ 2 offres
// PATCH { id, action: "approve"|"reject"|"suspend"|"feature"|"unfeature", note? }
//   approve  → PUBLISHED (+ publishedAt)
//   reject   → DRAFT (retour au propriétaire avec note de modération)
//   suspend  → SUSPENDED_OWNER
//   feature  → mise à la une (toggle via unfeature)
// ============================================================

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { auditAction, adminRateLimited, normalizeTitle } from "../helpers";

const querySchema = z.object({
  status: z.string().trim().max(30).optional(),
  duplicates: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject", "suspend", "feature", "unfeature"]),
  note: z.string().trim().max(500).optional(),
});

const LISTING_INCLUDE = {
  owner: { select: { id: true, fullName: true, kycStatus: true, phone: true } },
  media: {
    orderBy: [{ isCover: "desc" }, { position: "asc" }],
    take: 1,
    select: { url: true, thumbUrl: true },
  },
  _count: { select: { reports: true, favorites: true } },
} satisfies Prisma.ListingInclude;

type ListingPayload = Prisma.ListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

function shapeListing(l: ListingPayload) {
  const cover = l.media[0];
  return {
    id: l.id, reference: l.reference, title: l.title, type: l.type, genre: l.genre,
    category: l.category, status: l.status,
    price: l.dailyPrice ?? l.rentAmount,
    pricePeriod: l.dailyPrice != null ? "DAY" : l.rentPeriod,
    isFeatured: l.isFeatured, moderationNote: l.moderationNote,
    publishedAt: l.publishedAt, createdAt: l.createdAt,
    coverUrl: cover?.thumbUrl ?? cover?.url ?? null,
    owner: l.owner,
    reportsCount: l._count.reports,
    favoritesCount: l._count.favorites,
  };
}

function fetchListings(where: Prisma.ListingWhereInput, take: number) {
  return db.listing.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take,
    include: LISTING_INCLUDE,
  });
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);
    const url = new URL(req.url);

    if (q.duplicates === "1" || url.searchParams.get("duplicates") === "1") {
      // Détection de doublons : groupement (ownerId, titre normalisé), groupes ≥ 2
      const rows = await fetchListings({ deletedAt: null, status: { notIn: ["ARCHIVED"] } }, 500);
      const groups = new Map<string, ListingPayload[]>();
      for (const l of rows) {
        const key = `${l.ownerId}::${normalizeTitle(l.title)}`;
        const arr = groups.get(key) ?? [];
        arr.push(l);
        groups.set(key, arr);
      }
      const duplicated = [...groups.values()].filter((g) => g.length >= 2);
      return ok({
        groups: duplicated.map((g) => ({
          key: `${g[0].ownerId}::${normalizeTitle(g[0].title)}`,
          ownerId: g[0].ownerId,
          ownerName: g[0].owner.fullName,
          sameOwner: true,
          items: g.map(shapeListing),
        })),
      });
    }

    const status = q.status && q.status !== "ALL" ? q.status : undefined;
    const rows = await fetchListings(
      { deletedAt: null, ...(status ? { status } : { status: { notIn: ["DRAFT", "ARCHIVED"] } }) },
      q.take ?? 100,
    );
    return ok({ items: rows.map(shapeListing) });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("listings", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    const listing = await db.listing.findUnique({ where: { id: body.id }, select: { id: true, title: true, ownerId: true, status: true, reference: true } });
    if (!listing) throw new ApiError(404, "Offre introuvable.");

    let data: Prisma.ListingUpdateInput = {};
    let auditActionName: string;
    let notif: { title: string; body: string } | null = null;

    switch (body.action) {
      case "approve":
        if (listing.status === "PUBLISHED") throw new ApiError(400, "Cette offre est déjà publiée.");
        data = { status: "PUBLISHED", publishedAt: new Date(), moderationNote: body.note ?? null };
        auditActionName = "LISTING_APPROVE";
        notif = {
          title: "Offre approuvée ✓",
          body: `« ${listing.title} » est publiée et visible par les locataires.`,
        };
        break;
      case "reject":
        if (body.note && body.note.trim().length < 5) {
          throw new ApiError(400, "Précisez un motif de refus (5 caractères minimum).");
        }
        data = { status: "DRAFT", isFeatured: false, moderationNote: body.note ?? "Non conforme aux règles de publication." };
        auditActionName = "LISTING_REJECT";
        notif = {
          title: "Offre refusée",
          body: `« ${listing.title} » n'a pas été publiée. Motif : ${body.note ?? "non conforme aux règles de publication"}. Modifiez-la puis soumettez-la à nouveau.`,
        };
        break;
      case "suspend":
        data = { status: "SUSPENDED_OWNER", isFeatured: false, moderationNote: body.note ?? null };
        auditActionName = "LISTING_SUSPEND";
        notif = {
          title: "Offre suspendue",
          body: `« ${listing.title} » a été suspendue par l'administration.${body.note ? ` Motif : ${body.note}` : ""}`,
        };
        break;
      case "feature":
        data = { isFeatured: true };
        auditActionName = "LISTING_FEATURE";
        notif = {
          title: "Offre mise à la une ⭐",
          body: `« ${listing.title} » figure désormais en tête des résultats de recherche.`,
        };
        break;
      case "unfeature":
        data = { isFeatured: false };
        auditActionName = "LISTING_UNFEATURE";
        notif = null;
        break;
    }

    const updated = await db.listing.update({ where: { id: listing.id }, data });

    if (notif) {
      await sendNotification({
        userId: listing.ownerId,
        type: "SYSTEM",
        title: notif.title,
        body: notif.body,
        linkHash: "#/proprietaire/biens",
      });
    }

    await auditAction({
      actorId: actor.id,
      action: auditActionName,
      entityType: "Listing",
      entityId: listing.id,
      meta: { reference: listing.reference, previousStatus: listing.status, newStatus: updated.status, note: body.note ?? null },
      ip: meta.ip,
    });

    return ok({ id: updated.id, status: updated.status, isFeatured: updated.isFeatured });
  });
}
