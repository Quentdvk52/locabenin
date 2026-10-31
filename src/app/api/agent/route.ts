import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { handle, ok, parseBody, requireRole, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { walletBalance } from "@/lib/ledger";
import { getOrCreateLink } from "@/lib/affiliate";
import { getSettings } from "@/lib/settings";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { computeCommission, normalizeToMonthly } from "@/lib/finance";
import type { RentPeriod } from "@/lib/constants";

// ============================================================
// LocaBénin — Espace Démarcheur
// • GET            : KPIs (clics, commissions par statut, conversion),
//                    liens avec couverture + titre, solde portefeuille.
// • GET ?qr=CODE   : QR code (data URL) d'un lien — anti-IDOR : le lien
//                    doit appartenir au démarcheur connecté.
// • POST {listingId}: création (ou récupération) du lien d'affiliation.
// ============================================================

const createSchema = z.object({ listingId: z.string().min(5) });

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireRole("AGENT", "ADMIN");

    // QR code d'un lien existant (vérifie l'appartenance avant génération)
    const qrCode = new URL(req.url).searchParams.get("qr");
    if (qrCode) {
      const link = await db.affiliateLink.findUnique({ where: { code: qrCode }, select: { id: true, agentId: true, listingId: true, code: true } });
      if (!link || link.agentId !== user.id) return fail(404, "Lien introuvable.");
      const reqUrl = new URL(req.url);
      const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? reqUrl.protocol.replace(":", "");
      const host = req.headers.get("x-forwarded-host")?.split(",")[0] ?? req.headers.get("host") ?? reqUrl.host;
      const shareUrl = `${proto}://${host}/#/offres/${link.listingId}?ref=${link.code}`;
      const dataUrl = await QRCode.toDataURL(shareUrl, { width: 512, margin: 2, color: { dark: "#1c1917", light: "#ffffff" } });
      return ok({ dataUrl, url: shareUrl });
    }

    const [links, commissions, wallet, settings] = await Promise.all([
      db.affiliateLink.findMany({
        where: { agentId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          listing: {
            select: {
              id: true, title: true, reference: true, rentAmount: true, rentPeriod: true,
              genre: true, status: true, affiliateEnabled: true,
              media: { orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { url: true } },
            },
          },
        },
      }),
      db.commission.findMany({
        where: { agentId: user.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          listing: { select: { id: true, title: true } },
          lease: { select: { reference: true } },
        },
      }),
      walletBalance("AGENT", user.id),
      getSettings(),
    ]);

    // KPIs dérivés (jamais stockés, toujours recalculés)
    const totalClicks = links.reduce((a, l) => a + l.clicks, 0);
    const byStatus = {
      PENDING_VALIDATION: { count: 0, total: 0 },
      VALIDATED: { count: 0, total: 0 },
      PAID: { count: 0, total: 0 },
      CANCELLED: { count: 0, total: 0 },
    };
    let commissionsTotal = 0;
    const perLink = new Map<string, { count: number; total: number }>();
    for (const c of commissions) {
      const bucket = byStatus[c.status as keyof typeof byStatus];
      if (bucket) {
        bucket.count += 1;
        bucket.total += c.total;
      }
      commissionsTotal += c.total;
      const entry = perLink.get(c.linkId ?? "") ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += c.total;
      perLink.set(c.linkId ?? "", entry);
    }
    const concluded = byStatus.VALIDATED.count + byStatus.PAID.count;
    const conversionRate = totalClicks > 0 ? Math.round((commissions.length / totalClicks) * 1000) / 10 : 0;

    return ok({
      links: links.map((l) => ({
        id: l.id,
        code: l.code,
        clicks: l.clicks,
        createdAt: l.createdAt,
        listingId: l.listingId,
        listing: {
          id: l.listing.id,
          title: l.listing.title,
          reference: l.listing.reference,
          rentAmount: l.listing.rentAmount,
          rentPeriod: l.listing.rentPeriod,
          genre: l.listing.genre,
          status: l.listing.status,
          affiliateEnabled: l.listing.affiliateEnabled,
          coverUrl: l.listing.media[0]?.url ?? null,
        },
        commissionsCount: perLink.get(l.id)?.count ?? 0,
        commissionsTotal: perLink.get(l.id)?.total ?? 0,
      })),
      commissions: commissions.map((c) => ({
        id: c.id,
        listingId: c.listingId,
        listingTitle: c.listing.title,
        leaseRef: c.lease?.reference ?? null,
        tenantShare: c.tenantShare,
        ownerShare: c.ownerShare,
        total: c.total,
        status: c.status,
        validatableAt: c.validatableAt,
        validatedAt: c.validatedAt,
        paidAt: c.paidAt,
        createdAt: c.createdAt,
      })),
      stats: {
        totalClicks,
        totalLinks: links.length,
        commissionsCount: commissions.length,
        commissionsTotal,
        pending: byStatus.PENDING_VALIDATION,
        validated: byStatus.VALIDATED,
        paid: byStatus.PAID,
        cancelled: byStatus.CANCELLED,
        concluded,
        conversionRate,
      },
      walletBalance: wallet,
      settings: {
        commissionValidationDays: settings.commissionValidationDays,
        commissionTenantSharePct: settings.commissionTenantSharePct,
        commissionOwnerSharePct: settings.commissionOwnerSharePct,
        payoutMinAmount: settings.payoutMinAmount,
        payoutAutoApprovalThreshold: settings.payoutAutoApprovalThreshold,
      },
    });
  });
}

/**
 * Création de lien d'affiliation : anti auto-parrainage vérifié avant
 * l'appel à la lib (erreur propre), option « Démarcheur » exigée pour
 * une NOUVELLE affiliation (les liens existants restent consultables).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireRole("AGENT", "ADMIN");
    if (!rateLimit(`agentlink:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de tentatives. Patientez un instant.");
    }
    const { listingId } = await parseBody(req, createSchema);

    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, ownerId: true, affiliateEnabled: true, rentAmount: true, rentPeriod: true } });
    if (!listing) return fail(404, "Offre introuvable.");
    if (listing.ownerId === user.id) {
      return fail(400, "Un démarcheur ne peut pas s'affilier à sa propre offre.");
    }

    const existing = await db.affiliateLink.findUnique({ where: { listingId_agentId: { listingId, agentId: user.id } } });
    if (existing) return ok({ link: existing, created: false });

    if (!listing.affiliateEnabled) {
      return fail(400, "Cette offre n'est pas affiliable : le propriétaire n'a pas activé l'option Démarcheur.");
    }

    let link;
    try {
      link = await getOrCreateLink(listingId, user.id);
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : "Création du lien impossible.");
    }
    const monthly = normalizeToMonthly(listing.rentAmount, listing.rentPeriod as RentPeriod);
    const split = computeCommission(monthly);
    return ok({ link, created: true, estimatedCommission: split.total });
  });
}
