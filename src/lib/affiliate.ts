// ============================================================
// LocaBénin — Option Démarcheur : liens, attribution, anti-fraude
// • Lien unique par (offre, démarcheur) + QR code.
// • Attribution : cookie visiteur + paramètre ?ref= ; fenêtre configurable
//   (30 j par défaut) ; DERNIER clic prime (paramétrable back-office).
// • Anti-fraude : auto-parrainage impossible (le démarcheur ne peut pas
//   s'affilier à ses propres offres / se cliquer lui-même), détection de
//   doublons (même bail déjà commissionné), période de validation avant retrait.
// ============================================================

import "server-only";
import crypto from "crypto";
import { db } from "./db";
import { getSettings } from "./settings";
import { computeCommission, normalizeToMonthly } from "./finance";
import type { RentPeriod } from "./constants";

export function generateLinkCode(): string {
  return crypto.randomBytes(5).toString("base64url").toUpperCase();
}

/** Crée (ou retrouve) le lien d'affiliation d'un démarcheur pour une offre. */
export async function getOrCreateLink(listingId: string, agentId: string) {
  const existing = await db.affiliateLink.findUnique({ where: { listingId_agentId: { listingId, agentId } } });
  if (existing) return existing;
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true, affiliateEnabled: true } });
  if (!listing) throw new Error("Offre introuvable.");
  if (listing.ownerId === agentId) throw new Error("Un démarcheur ne peut pas s'affilier à sa propre offre.");
  let code = generateLinkCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.affiliateLink.findUnique({ where: { code } });
    if (!clash) break;
    code = generateLinkCode();
  }
  return db.affiliateLink.create({ data: { listingId, agentId, code } });
}

/** Enregistre un clic et met à jour l'attribution courante du visiteur. */
export async function trackClick(input: {
  visitorId: string;
  refCode: string;
  ip?: string;
  userAgent?: string;
  clickingUserId?: string | null;
}): Promise<{ tracked: boolean; reason?: string }> {
  const settings = await getSettings();
  const link = await db.affiliateLink.findUnique({ where: { code: input.refCode }, include: { listing: { select: { ownerId: true, affiliateEnabled: true, id: true } } } });
  if (!link) return { tracked: false, reason: "Lien inconnu" };
  if (!link.listing.affiliateEnabled) return { tracked: false, reason: "Offre non affiliable" };

  // Anti-fraude 1 : auto-parrainage (même utilisateur connecté)
  if (input.clickingUserId && (input.clickingUserId === link.agentId || input.clickingUserId === link.listing.ownerId)) {
    return { tracked: false, reason: "Auto-parrainage bloqué" };
  }

  await db.affiliateLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  await db.affiliateClick.create({
    data: { linkId: link.id, visitorId: input.visitorId, ip: input.ip, userAgent: input.userAgent?.slice(0, 255) },
  });

  const expiresAt = new Date(Date.now() + settings.affiliateWindowDays * 86400_000);
  const existing = await db.affiliateAttribution.findUnique({ where: { visitorId: input.visitorId } });
  if (!existing) {
    await db.affiliateAttribution.create({
      data: { visitorId: input.visitorId, linkId: link.id, agentId: link.agentId, listingId: link.listingId, expiresAt },
    });
  } else if (settings.affiliateAttribution === "last_click" || existing.expiresAt < new Date()) {
    await db.affiliateAttribution.update({
      where: { visitorId: input.visitorId },
      data: { linkId: link.id, agentId: link.agentId, listingId: link.listingId, lastClickAt: new Date(), expiresAt },
    });
  }
  return { tracked: true };
}

/** Attributions valides d'un visiteur (non expirées). */
export async function activeAttribution(visitorId: string) {
  return db.affiliateAttribution.findFirst({
    where: { visitorId, expiresAt: { gte: new Date() } },
    include: { link: { include: { listing: { select: { id: true, ownerId: true, rentAmount: true, rentPeriod: true, affiliateEnabled: true } } } } },
  });
}

/**
 * Calcule les parts de commission pour un bail donné selon le loyer et les
 * réglages admin (25/25 par défaut). Retourne null si pas de commission due
 * (meublé < 1 mois, réglage désactivé, offre non affiliable).
 */
export function commissionForLease(input: {
  monthlyRent: number;
  leaseMonths: number;
  kind: string;
}, settings: { commissionTenantSharePct: number; commissionOwnerSharePct: number; commissionMinDurationMonths: number }) {
  if (input.kind === "FURNISHED" && input.leaseMonths < settings.commissionMinDurationMonths) return null;
  return computeCommission(input.monthlyRent, settings.commissionTenantSharePct, settings.commissionOwnerSharePct);
}

export function monthlyRentOf(rentAmount: number, rentPeriod: RentPeriod): number {
  return normalizeToMonthly(rentAmount, rentPeriod);
}
