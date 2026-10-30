import { NextRequest } from "next/server";
import crypto from "crypto";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings, categoryForType } from "@/lib/settings";
import { refreshCurrentInvoice } from "@/lib/subscription";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { listingInputSchema } from "./schema";

/** Référence unique LB-XXXXXX (6 caractères alphanumériques). */
async function uniqueReference(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6).toUpperCase();
    const reference = `LB-${code}`;
    const exists = await db.listing.findUnique({ where: { reference }, select: { id: true } });
    if (!exists) return reference;
  }
  return `LB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Mes offres — tous statuts, média de couverture, compteurs. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");

    const listings = await db.listing.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 },
        area: { include: { commune: { include: { department: { select: { name: true } } } } } },
        _count: { select: { visits: true, favorites: true, applications: { where: { status: "PENDING" } } } },
      },
    });

    return ok(
      listings.map((l) => ({
        id: l.id,
        reference: l.reference,
        title: l.title,
        type: l.type,
        genre: l.genre,
        category: l.category,
        status: l.status,
        rentAmount: l.rentAmount,
        rentPeriod: l.rentPeriod,
        dailyPrice: l.dailyPrice,
        weeklyPrice: l.weeklyPrice,
        monthlyPrice: l.monthlyPrice,
        depositAmount: l.depositAmount,
        advanceMonths: l.advanceMonths,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        surfaceM2: l.surfaceM2,
        addressText: l.addressText,
        areaName: l.area?.name ?? null,
        communeName: l.area?.commune?.name ?? null,
        affiliateEnabled: l.affiliateEnabled,
        visitsCount: l.visitsCount,
        favoritesCount: l.favoritesCount,
        pendingApplications: l._count.applications,
        coverUrl: l.media[0]?.url ?? null,
        publishedAt: l.publishedAt,
        createdAt: l.createdAt,
        moderationNote: l.moderationNote,
      })),
    );
  });
}

/** Création d'une offre (assistante 5 étapes côté client) → publication ou validation. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    if (!rateLimit(`listing-create:${user.id}`, 10, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de créations d'offres, patientez un peu.");
    }
    const body = await parseBody(req, listingInputSchema);

    // Référentiels : quartier réel + immeuble possédé
    const area = await db.area.findUnique({ where: { id: body.areaId }, select: { id: true } });
    if (!area) throw new ApiError(400, "Quartier inconnu.");
    if (body.propertyId) {
      const property = await db.property.findUnique({ where: { id: body.propertyId }, select: { ownerId: true } });
      if (!property || property.ownerId !== user.id) throw new ApiError(403, "Cet immeuble ne vous appartient pas.");
    }
    // Équipements : codes → ids réels
    const amenityRows = body.amenities.length
      ? await db.amenity.findMany({ where: { code: { in: body.amenities } }, select: { id: true } })
      : [];

    const settings = await getSettings();
    // Meublé : sans caution ni avance (règle métier), tarif de base = tarif journalier
    const isFurnished = body.genre === "FURNISHED";
    const category = isFurnished ? "FURNISHED" : categoryForType(body.type, settings);
    const status = settings.autoPublishListings ? "PUBLISHED" : "PENDING_REVIEW";
    const now = new Date();

    const listing = await db.listing.create({
      data: {
        reference: await uniqueReference(),
        ownerId: user.id,
        propertyId: body.propertyId ?? null,
        title: body.title,
        description: body.description,
        type: body.type,
        genre: body.genre,
        category,
        status,
        publishedAt: status === "PUBLISHED" ? now : null,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        livingRooms: body.livingRooms,
        surfaceM2: body.surfaceM2,
        addressText: body.addressText,
        areaId: body.areaId,
        latitude: body.latitude,
        longitude: body.longitude,
        rentAmount: isFurnished ? (body.dailyPrice ?? 0) : body.rentAmount,
        rentPeriod: isFurnished ? "DAY" : body.rentPeriod,
        depositAmount: isFurnished ? 0 : body.depositAmount,
        advanceMonths: isFurnished ? 0 : body.advanceMonths,
        dailyPrice: isFurnished ? body.dailyPrice : null,
        weeklyPrice: isFurnished ? body.weeklyPrice : null,
        monthlyPrice: isFurnished ? body.monthlyPrice : null,
        minStayDays: isFurnished ? body.minStayDays : null,
        allowPartial: false,
        rulesText: body.rulesText,
        affiliateEnabled: body.affiliateEnabled,
        media: { create: body.media.map((m, i) => ({ ...m, position: m.position || i })) },
        depositOptions: { create: isFurnished ? [] : body.depositOptions },
        amenities: { create: amenityRows.map((a) => ({ amenityId: a.id })) },
      },
    });

    // L'abonnement dépend des catégories actives → ajuste la facture courante si impayée
    await refreshCurrentInvoice(user.id);

    return ok({
      id: listing.id,
      reference: listing.reference,
      status: listing.status,
      category: listing.category,
    });
  });
}
