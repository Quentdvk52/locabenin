import { NextRequest } from "next/server";
import { handle, ok, fail, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { getSessionUser, getVisitorId, getOrCreateVisitorId } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { activeAttribution, trackClick, monthlyRentOf } from "@/lib/affiliate";
import { initialPaymentBreakdown, sumLines } from "@/lib/finance";
import { label } from "@/lib/constants";

/**
 * Fiche d'une offre (publique).
 * Gère aussi l'attribution d'affiliation : ?ref=CODE → clic enregistré,
 * cookie visiteur mis à jour (dernier clic prime), frais de démarcheur
 * affichés clairement au locataire dans le calculateur.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const ref = new URL(req.url).searchParams.get("ref");

    const listing = await db.listing.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true, kycStatus: true, createdAt: true, phone: true, whatsapp: true } },
        area: { include: { commune: { include: { department: true } } } },
        media: { orderBy: [{ isCover: "desc" }, { position: "asc" }] },
        depositOptions: true,
        amenities: { include: { amenity: true } },
        reviews: { where: { status: "PUBLISHED" }, include: { author: { select: { fullName: true, avatarUrl: true } } }, take: 5, orderBy: { createdAt: "desc" } },
        calendarBlocks: { where: { endDate: { gte: new Date() } } },
      },
    });
    if (!listing) return fail(404, "Cette offre n'existe pas ou a été retirée.");
    const isPublicVisible = ["PUBLISHED", "RESERVED", "RENTED"].includes(listing.status);
    const user = await getSessionUser();
    if (!isPublicVisible && listing.ownerId !== user?.id && !user?.isAdmin) {
      return fail(404, "Cette offre n'est pas disponible actuellement.");
    }

    // ---- Attribution affiliation (clic depuis un lien démarcheur) ----
    let attributed = false;
    if (ref) {
      const visitorId = await getOrCreateVisitorId();
      const result = await trackClick({
        visitorId, refCode: ref,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0],
        userAgent: req.headers.get("user-agent") ?? undefined,
        clickingUserId: user?.id ?? null,
      });
      attributed = result.tracked;
    }
    const visitorId = await getVisitorId();
    const attribution = visitorId ? await activeAttribution(visitorId) : null;
    const attributedToListing = attribution?.listingId === listing.id && listing.affiliateEnabled;

    // ---- Calculateur « coût total à l'entrée » ----
    const settings = await getSettings();
    const monthlyRent = monthlyRentOf(listing.rentAmount, listing.rentPeriod as never);
    const commission = attributedToListing
      ? { tenantShare: Math.round((monthlyRent * settings.commissionTenantSharePct) / 100), ownerShare: Math.round((monthlyRent * settings.commissionOwnerSharePct) / 100) }
      : null;

    let entryCost = null as null | { lines: Array<{ label: string; amount: number }>; total: number; note: string };
    if (listing.genre === "SIMPLE") {
      const lines = initialPaymentBreakdown({
        rentAmount: listing.rentAmount,
        rentPeriod: listing.rentPeriod as never,
        depositAmount: listing.depositAmount,
        advanceMonths: listing.advanceMonths,
        depositOptions: listing.depositOptions,
        commissionTenantShare: commission?.tenantShare ?? 0,
      });
      entryCost = {
        lines, total: sumLines(lines),
        note: listing.advanceMonths > 0 ? `Loyer payable par ${label(listing.rentPeriod)} + ${listing.advanceMonths} mois d'avance à l'entrée.` : `Loyer payable par ${label(listing.rentPeriod)}.`,
      };
    } else {
      const lines: Array<{ label: string; amount: number }> = [];
      if (listing.dailyPrice) lines.push({ label: "Nuitée", amount: listing.dailyPrice });
      if (listing.weeklyPrice) lines.push({ label: "Semaine", amount: listing.weeklyPrice });
      if (listing.monthlyPrice) lines.push({ label: "Mois", amount: listing.monthlyPrice });
      entryCost = { lines, total: 0, note: "Aucune caution : les meublés se réservent et se paient en ligne." };
    }

    await db.listing.update({ where: { id: listing.id }, data: { visitsCount: { increment: 1 } } }).catch(() => {});

    const isFavorite = user ? Boolean(await db.favorite.findUnique({ where: { userId_listingId: { userId: user.id, listingId: listing.id } } })) : false;

    // Offres similaires (même commune, même genre, hors courante)
    const similar = await db.listing.findMany({
      where: { id: { not: listing.id }, genre: listing.genre, status: "PUBLISHED", deletedAt: null, area: listing.areaId ? { communeId: listing.area!.communeId } : undefined },
      include: { media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1 }, area: { include: { commune: true } } },
      take: 4,
      orderBy: { createdAt: "desc" },
    });

    return ok({
      listing: {
        id: listing.id, reference: listing.reference, title: listing.title, description: listing.description,
        type: listing.type, genre: listing.genre, status: listing.status,
        bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, livingRooms: listing.livingRooms, surfaceM2: listing.surfaceM2,
        rentAmount: listing.rentAmount, rentPeriod: listing.rentPeriod,
        depositAmount: listing.depositAmount, advanceMonths: listing.advanceMonths,
        dailyPrice: listing.dailyPrice, weeklyPrice: listing.weeklyPrice, monthlyPrice: listing.monthlyPrice, minStayDays: listing.minStayDays,
        allowPartial: listing.allowPartial, rulesText: listing.rulesText,
        affiliateEnabled: listing.affiliateEnabled,
        addressText: listing.addressText,
        area: listing.area ? { id: listing.area.id, name: listing.area.name } : null,
        commune: listing.area?.commune ? { id: listing.area.commune.id, name: listing.area.commune.name } : null,
        department: listing.area?.commune?.department ? { code: listing.area.commune.department.code, name: listing.area.commune.department.name } : null,
        latitude: listing.latitude, longitude: listing.longitude,
        media: listing.media.map((m) => ({ id: m.id, url: m.url, kind: m.kind, isCover: m.isCover })),
        amenities: listing.amenities.map((a) => ({ code: a.amenity.code, label: a.amenity.label, icon: a.amenity.icon, group: a.amenity.group })),
        depositOptions: listing.depositOptions.map((d) => ({ label: d.label, amount: d.amount })),
        visitsCount: listing.visitsCount,
        publishedAt: listing.publishedAt,
        calendarBlocks: listing.calendarBlocks.map((b) => ({ startDate: b.startDate, endDate: b.endDate, reason: b.reason })),
        reviews: listing.reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: r.author.fullName, createdAt: r.createdAt })),
      },
      owner: {
        id: listing.owner.id, fullName: listing.owner.fullName, avatarUrl: listing.owner.avatarUrl,
        kycStatus: listing.owner.kycStatus, memberSince: listing.owner.createdAt,
        phone: listing.status === "PUBLISHED" && user ? listing.owner.phone : null,
        whatsapp: listing.status === "PUBLISHED" && user ? listing.owner.whatsapp ?? listing.owner.phone : null,
      },
      entryCost,
      commission,
      attributed: attributedToListing,
      attributedNow: attributed,
      isFavorite,
      similar: similar.map((l) => ({
        id: l.id, reference: l.reference, title: l.title, type: l.type, genre: l.genre, status: l.status,
        rentAmount: l.rentAmount, rentPeriod: l.rentPeriod, dailyPrice: l.dailyPrice, weeklyPrice: l.weeklyPrice, monthlyPrice: l.monthlyPrice,
        depositAmount: l.depositAmount, bedrooms: l.bedrooms, bathrooms: l.bathrooms, surfaceM2: l.surfaceM2,
        areaName: l.area?.name ?? null, communeName: l.area?.commune?.name ?? null,
        coverUrl: l.media[0]?.url ?? null, photos: l.media.map((m) => ({ url: m.url })), isFavorite: false,
      })),
      viewerIsOwner: user?.id === listing.ownerId,
    });
  });
}
