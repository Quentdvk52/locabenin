import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail, assertListingOwnership } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings, categoryForType } from "@/lib/settings";
import { refreshCurrentInvoice } from "@/lib/subscription";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { listingInputSchema } from "../schema";

async function uniqueReference(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const reference = `LB-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const exists = await db.listing.findUnique({ where: { reference }, select: { id: true } });
    if (!exists) return reference;
  }
  return `LB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Détail d'une de MES offres (mode édition de l'assistant). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await assertListingOwnership(id, user.id);
    const listing = await db.listing.findUnique({
      where: { id },
      include: {
        media: { orderBy: [{ isCover: "desc" }, { position: "asc" }] },
        depositOptions: { orderBy: { label: "asc" } },
        amenities: { include: { amenity: { select: { code: true } } } },
        area: { include: { commune: { include: { department: true } } } },
      },
    });
    if (!listing) return fail(404, "Offre introuvable.");
    return ok({
      id: listing.id,
      reference: listing.reference,
      title: listing.title,
      description: listing.description,
      type: listing.type,
      genre: listing.genre,
      status: listing.status,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      livingRooms: listing.livingRooms,
      surfaceM2: listing.surfaceM2,
      addressText: listing.addressText,
      areaId: listing.areaId,
      latitude: listing.latitude,
      longitude: listing.longitude,
      propertyId: listing.propertyId,
      rentAmount: listing.rentAmount,
      rentPeriod: listing.rentPeriod,
      depositAmount: listing.depositAmount,
      advanceMonths: listing.advanceMonths,
      dailyPrice: listing.dailyPrice,
      weeklyPrice: listing.weeklyPrice,
      monthlyPrice: listing.monthlyPrice,
      minStayDays: listing.minStayDays,
      rulesText: listing.rulesText,
      affiliateEnabled: listing.affiliateEnabled,
      amenities: listing.amenities.map((a) => a.amenity.code),
      depositOptions: listing.depositOptions.map((d) => ({ label: d.label, amount: d.amount })),
      media: listing.media.map((m) => ({ url: m.url, kind: m.kind, position: m.position, isCover: m.isCover })),
      area: listing.area ? { name: listing.area.name, commune: listing.area.commune?.name ?? null, departmentCode: listing.area.commune?.department?.code ?? null } : null,
    });
  });
}

/** Mise à jour complète (assistant en mode édition). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await assertListingOwnership(id, user.id);
    if (!rateLimit(`listing-update:${user.id}`, 30, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de mises à jour, patientez un peu.");
    }
    const body = await parseBody(req, listingInputSchema);

    const existing = await db.listing.findUnique({ where: { id }, select: { status: true, publishedAt: true } });
    if (!existing) return fail(404, "Offre introuvable.");

    const area = await db.area.findUnique({ where: { id: body.areaId }, select: { id: true } });
    if (!area) throw new ApiError(400, "Quartier inconnu.");
    if (body.propertyId) {
      const property = await db.property.findUnique({ where: { id: body.propertyId }, select: { ownerId: true } });
      if (!property || property.ownerId !== user.id) throw new ApiError(403, "Cet immeuble ne vous appartient pas.");
    }
    const amenityRows = body.amenities.length
      ? await db.amenity.findMany({ where: { code: { in: body.amenities } }, select: { id: true } })
      : [];

    const settings = await getSettings();
    const isFurnished = body.genre === "FURNISHED";
    const category = isFurnished ? "FURNISHED" : categoryForType(body.type, settings);
    const now = new Date();

    await db.$transaction([
      db.listing.update({
        where: { id },
        data: {
          propertyId: body.propertyId ?? null,
          title: body.title,
          description: body.description,
          type: body.type,
          genre: body.genre,
          category,
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
          rulesText: body.rulesText,
          affiliateEnabled: body.affiliateEnabled,
          // Une offre DRAFT modifiée repart en publication/validation
          status: existing.status === "DRAFT" ? (settings.autoPublishListings ? "PUBLISHED" : "PENDING_REVIEW") : existing.status,
          publishedAt: existing.publishedAt ?? (existing.status !== "DRAFT" ? now : null),
          media: { deleteMany: {}, create: body.media.map((m, i) => ({ ...m, position: m.position || i })) },
          depositOptions: { deleteMany: {}, create: isFurnished ? [] : body.depositOptions },
          amenities: { deleteMany: {}, create: amenityRows.map((a) => ({ amenityId: a.id })) },
        },
      }),
    ]);

    await refreshCurrentInvoice(user.id);
    return ok({ updated: true, id });
  });
}

const patchSchema = z.object({
  action: z.enum(["publish", "suspend", "archive", "duplicate"]).optional(),
  affiliateEnabled: z.boolean().optional(),
  title: z.string().trim().min(8).max(120).optional(),
  description: z.string().trim().min(30).max(5000).optional(),
  rulesText: z.string().trim().max(2000).nullable().optional(),
  rentAmount: z.number().int().min(0).optional(),
  depositAmount: z.number().int().min(0).optional(),
  advanceMonths: z.number().int().min(0).max(12).optional(),
});

/**
 * Mise à jour partielle + actions :
 *  • publish → PUBLISHED (auto-publication) ou PENDING_REVIEW (validation)
 *  • suspend → SUSPENDED_OWNER (masquée par le propriétaire)
 *  • archive → ARCHIVED (sort de l'espace actif)
 *  • duplicate → copie DRAFT retitlée « (copie) »
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const owned = await assertListingOwnership(id, user.id);
    if (!rateLimit(`listing-patch:${user.id}`, 30, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop d'actions, patientez un peu.");
    }
    const body = await parseBody(req, patchSchema);

    // Simple bascule « Démarcheur » depuis la liste
    if (body.affiliateEnabled !== undefined && !body.action) {
      await db.listing.update({ where: { id }, data: { affiliateEnabled: body.affiliateEnabled } });
      return ok({ updated: true });
    }

    const settings = await getSettings();

    if (body.action === "publish") {
      const status = settings.autoPublishListings ? "PUBLISHED" : "PENDING_REVIEW";
      await db.listing.update({ where: { id }, data: { status, publishedAt: new Date() } });
      await refreshCurrentInvoice(user.id);
      return ok({ status });
    }
    if (body.action === "suspend") {
      await db.listing.update({ where: { id }, data: { status: "SUSPENDED_OWNER" } });
      return ok({ status: "SUSPENDED_OWNER" });
    }
    if (body.action === "archive") {
      await db.listing.update({ where: { id }, data: { status: "ARCHIVED" } });
      await refreshCurrentInvoice(user.id);
      return ok({ status: "ARCHIVED" });
    }
    if (body.action === "duplicate") {
      const source = await db.listing.findUnique({
        where: { id },
        include: {
          media: true,
          depositOptions: true,
          amenities: { select: { amenityId: true } },
        },
      });
      if (!source) return fail(404, "Offre introuvable.");
      const copy = await db.listing.create({
        data: {
          reference: await uniqueReference(),
          ownerId: user.id,
          propertyId: source.propertyId,
          title: `${source.title.slice(0, 112)} (copie)`,
          description: source.description,
          type: source.type,
          genre: source.genre,
          category: source.category,
          status: "DRAFT",
          bedrooms: source.bedrooms,
          bathrooms: source.bathrooms,
          livingRooms: source.livingRooms,
          surfaceM2: source.surfaceM2,
          addressText: source.addressText,
          areaId: source.areaId,
          latitude: source.latitude,
          longitude: source.longitude,
          rentAmount: source.rentAmount,
          rentPeriod: source.rentPeriod,
          depositAmount: source.depositAmount,
          advanceMonths: source.advanceMonths,
          dailyPrice: source.dailyPrice,
          weeklyPrice: source.weeklyPrice,
          monthlyPrice: source.monthlyPrice,
          minStayDays: source.minStayDays,
          rulesText: source.rulesText,
          affiliateEnabled: source.affiliateEnabled,
          media: { create: source.media.map((m) => ({ url: m.url, kind: m.kind, position: m.position, isCover: m.isCover, thumbUrl: m.thumbUrl, width: m.width, height: m.height, sizeBytes: m.sizeBytes })) },
          depositOptions: { create: source.depositOptions.map((d) => ({ label: d.label, amount: d.amount })) },
          amenities: { create: source.amenities.map((a) => ({ amenityId: a.amenityId })) },
        },
      });
      return ok({ id: copy.id, reference: copy.reference, status: copy.status });
    }

    // Mise à jour partielle de champs libres
    const data: Record<string, unknown> = {};
    for (const key of ["title", "description", "rulesText", "rentAmount", "depositAmount", "advanceMonths"] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, "Aucune modification fournie.");
    await db.listing.update({ where: { id }, data });
    void owned;
    return ok({ updated: true });
  });
}

/** Remplacement complet de la liste des médias (deleteMany + recreate). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await assertListingOwnership(id, user.id);
    const body = await parseBody(
      req,
      z.object({ media: z.array(z.object({ url: z.string().min(4).max(600), kind: z.enum(["IMAGE", "VIDEO"]), position: z.number().int().min(0).max(60).default(0), isCover: z.boolean().default(false) })).max(15) }),
    );
    await db.listingMedia.deleteMany({ where: { listingId: id } });
    await db.listingMedia.createMany({
      data: body.media.map((m, i) => ({ listingId: id, url: m.url, kind: m.kind, position: m.position || i, isCover: m.isCover })),
    });
    return ok({ replaced: true, count: body.media.length });
  });
}
