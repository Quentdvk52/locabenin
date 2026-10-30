import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseQuery, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { getSessionUser, getVisitorId } from "@/lib/auth";
import { getSettings, categoryForType } from "@/lib/settings";
import { activeAttribution } from "@/lib/affiliate";
import { LISTING_TYPES, RENT_PERIODS, type RentPeriod, type ListingType } from "@/lib/constants";

// Recherche publique — filtres partageables dans l'URL + pagination keyset.
// La publication est payante : les offres des catégories impayées au-delà de
// la grâce sont en SUSPENDED_UNPAID et n'apparaissent jamais ici.

const sortEnum = z.enum(["recent", "price_asc", "price_desc", "popular"]).default("recent");

const schema = z.object({
  q: z.string().max(120).optional(),
  type: z.string().optional(),               // codes séparés par des virgules
  feature: z.string().optional(),            // studio | chambre-salon | deux-chambres-salon | 3plus
  genre: z.enum(["SIMPLE", "FURNISHED"]).optional(),
  min: z.coerce.number().int().nonnegative().optional(),
  max: z.coerce.number().int().nonnegative().optional(),
  period: z.string().optional(),             // périodes séparées par virgules
  dept: z.string().optional(),
  commune: z.string().optional(),
  area: z.string().optional(),
  amenities: z.string().optional(),          // codes séparés par virgules
  sort: sortEnum,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  featured: z.enum(["1"]).optional(),
  demoCity: z.string().optional(),           // pages SEO villes
});

export type ListingSearchItem = Awaited<ReturnType<typeof searchListings>>["items"][number];

function featureToBedrooms(feature: string): { gte?: number; in?: number[] } {
  switch (feature) {
    case "studio": return { in: [0] };
    case "chambre-salon": return { in: [1] };
    case "deux-chambres-salon": return { in: [2] };
    case "3plus": return { gte: 3 };
    default: return {};
  }
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const params = parseQuery(req, schema);
    const user = await getSessionUser();

    const where: Record<string, unknown> = {
      status: { in: ["PUBLISHED", "RESERVED", "RENTED"] },
      deletedAt: null,
    };
    if (params.featured) where.isFeatured = true;
    if (params.q) {
      where.OR = [
        { title: { contains: params.q } },
        { description: { contains: params.q } },
        { addressText: { contains: params.q } },
      ];
    }
    if (params.type) {
      const types = params.type.split(",").filter((t) => (LISTING_TYPES as readonly string[]).includes(t));
      if (types.length) where.type = { in: types };
    }
    if (params.genre) where.genre = params.genre;
    if (params.feature) where.bedrooms = featureToBedrooms(params.feature);
    if (params.min || params.max) where.rentAmount = { ...(params.min ? { gte: params.min } : {}), ...(params.max ? { lte: params.max } : {}) };
    if (params.period) {
      const periods = params.period.split(",").filter((p) => (RENT_PERIODS as readonly string[]).includes(p));
      if (periods.length) where.rentPeriod = { in: periods };
    }
    if (params.area) where.areaId = params.area;
    else if (params.commune) where.area = { communeId: params.commune };
    else if (params.dept) where.area = { commune: { department: { code: params.dept } } };
    if (params.amenities) {
      const codes = params.amenities.split(",").filter(Boolean);
      if (codes.length) where.amenities = { some: { amenityId: { in: codes } } };
    }
    // « demoCity » = pages SEO par ville (slug simple → nom de commune)
    if (params.demoCity) {
      where.area = { commune: { name: { contains: params.demoCity.replace(/-/g, " ") } } };
    }

    // Ordre + curseur keyset (jamais d'offset)
    const limit = params.limit;
    let orderBy: Record<string, "asc" | "desc">[];
    let cursorWhere: Record<string, unknown> = {};
    if (params.sort === "price_asc") orderBy = [{ rentAmount: "asc" }, { id: "asc" }];
    else if (params.sort === "price_desc") orderBy = [{ rentAmount: "desc" }, { id: "asc" }];
    else if (params.sort === "popular") orderBy = [{ favoritesCount: "desc" }, { id: "asc" }];
    else orderBy = [{ createdAt: "desc" }, { id: "desc" }];

    if (params.cursor) {
      try {
        const c = JSON.parse(Buffer.from(params.cursor, "base64url").toString()) as { v: (number | string)[] };
        const [a, id] = c.v;
        if (params.sort === "price_asc") cursorWhere = { OR: [{ rentAmount: { gt: a } }, { rentAmount: a, id: { gt: id } }] };
        else if (params.sort === "price_desc") cursorWhere = { OR: [{ rentAmount: { lt: a } }, { rentAmount: a, id: { gt: id } }] };
        else if (params.sort === "popular") cursorWhere = { OR: [{ favoritesCount: { lt: a } }, { favoritesCount: a, id: { gt: id } }] };
        else cursorWhere = { OR: [{ createdAt: { lt: new Date(a as string) } }, { createdAt: new Date(a as string), id: { lt: id } }] };
      } catch {
        return fail(400, "Curseur de pagination invalide.");
      }
    }

    const rows = await db.listing.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy,
      take: limit + 1,
      include: {
        area: { include: { commune: { include: { department: true } } } },
        media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 5 },
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const favIds = user ? (await db.favorite.findMany({ where: { userId: user.id, listingId: { in: page.map((l) => l.id) } } })).map((f) => f.listingId) : [];

    // Montant de commission estimé pour les démarcheurs + attribution en cours
    const settings = await getSettings();
    const visitorId = await getVisitorId();
    const attribution = visitorId ? await activeAttribution(visitorId) : null;

    const items = page.map((l) => {
      const isAgent = user?.activeRole === "AGENT";
      const commissionAmount = l.affiliateEnabled ? Math.round((l.rentAmount * (settings.commissionTenantSharePct + settings.commissionOwnerSharePct)) / 100) : null;
      return {
        id: l.id,
        reference: l.reference,
        title: l.title,
        type: l.type,
        genre: l.genre,
        status: l.status,
        rentAmount: l.rentAmount,
        rentPeriod: l.rentPeriod,
        dailyPrice: l.dailyPrice,
        weeklyPrice: l.weeklyPrice,
        monthlyPrice: l.monthlyPrice,
        depositAmount: l.depositAmount,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        surfaceM2: l.surfaceM2,
        areaName: l.area?.name ?? null,
        communeName: l.area?.commune?.name ?? null,
        isFeatured: l.isFeatured,
        affiliateEnabled: l.affiliateEnabled,
        coverUrl: l.media[0]?.url ?? null,
        photos: l.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl })),
        isFavorite: favIds.includes(l.id),
        commissionAmount: isAgent ? commissionAmount : null,
        // L'affiliation attribuée via ce clic (pour l'affichage de la ligne frais démarcheur)
        attributedViaThisView: attribution?.listingId === l.id,
      };
    });

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1];
      const v: (number | string)[] =
        params.sort === "price_asc" ? [last.rentAmount, last.id] :
        params.sort === "price_desc" ? [last.rentAmount, last.id] :
        params.sort === "popular" ? [last.favoritesCount, last.id] :
        [last.createdAt.toISOString(), last.id];
      nextCursor = Buffer.from(JSON.stringify({ v })).toString("base64url");
    }
    const total = await db.listing.count({ where });
    return ok({ items, nextCursor, total });
  });
}
