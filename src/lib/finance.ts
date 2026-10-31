// ============================================================
// LocaBénin — Logique financière PURE (FCFA entiers)
// Toutes les fonctions sont déterministes et testées par bun test.
// Interdiction absolue de flottants pour l'argent : arrondis contrôlés.
// ============================================================

import { PERIOD_MONTHS, type RentPeriod } from "./constants";

/** Arrondi bancaire simple vers l'entier le plus proche (FCFA n'a pas de centimes). */
export function roundFcfa(x: number): number {
  return Math.round(x);
}

/**
 * Normalise un loyer vers son équivalent mensuel.
 * Sert au calcul de la commission démarcheur (½ mois de loyer) quel que soit
 * le mode de facturation (jour, semaine, mois, trimestre, semestre, bail).
 */
export function normalizeToMonthly(rentAmount: number, period: RentPeriod): number {
  if (!Number.isFinite(rentAmount) || rentAmount <= 0) return 0;
  const months = PERIOD_MONTHS[period] ?? 1;
  return roundFcfa(rentAmount / months);
}

export interface CommissionSplit {
  total: number;       // ½ mois de loyer (50 %)
  tenantShare: number; // 25 % d'un mois — payé par le locataire
  ownerShare: number;  // 25 % d'un mois — déduit du propriétaire
}

/**
 * Calcule la commission démarcheur totale : ½ mois de loyer,
 * réparti 25 % locataire + 25 % propriétaire (parts strictement égales,
 * la part locataire sert de base d'arrondi pour garder la symétrie).
 * Taux paramétrables via les settings admin (défaut 25/25).
 */
export function computeCommission(
  monthlyRent: number,
  tenantSharePct = 25,
  ownerSharePct = 25,
): CommissionSplit {
  const tenantShare = roundFcfa((monthlyRent * tenantSharePct) / 100);
  const ownerShare = roundFcfa((monthlyRent * ownerSharePct) / 100);
  return { tenantShare, ownerShare, total: tenantShare + ownerShare };
}

/** Total mensuel d'abonnement = somme des tarifs des catégories actives (une fois chacune). */
export function subscriptionTotal(
  activeCategories: Array<{ category: string; monthlyPrice: number }>,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const c of activeCategories) {
    if (seen.has(c.category)) continue;
    seen.add(c.category);
    total += Math.max(0, Math.round(c.monthlyPrice));
  }
  return total;
}

export interface PricingInput {
  rentAmount: number;
  rentPeriod: RentPeriod;
  depositAmount: number;      // caution
  advanceMonths: number;      // mois d'avance
  depositOptions: Array<{ label: string; amount: number }>;
  commissionTenantShare?: number; // 0 si pas d'option démarcheur
  commissionOwnerShare?: number;
}

export interface BreakdownLine {
  label: string;
  amount: number;
}

/**
 * Détail du « coût total à l'entrée » pour une location simple :
 * caution + avances + cautions optionnelles + part démarcheur du locataire.
 * Affiché au locataire AVANT paiement (transparence obligatoire).
 */
export function initialPaymentBreakdown(input: PricingInput, periodCount = 1): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  const monthly = normalizeToMonthly(input.rentAmount, input.rentPeriod);
  const advances = roundFcfa(monthly * input.advanceMonths);
  if (input.rentAmount > 0) {
    lines.push({ label: `Loyer — ${periodCount} période(s)`, amount: roundFcfa(input.rentAmount * periodCount) });
  }
  if (input.depositAmount > 0) lines.push({ label: "Caution", amount: input.depositAmount });
  if (advances > 0) lines.push({ label: `Avances — ${input.advanceMonths} mois`, amount: advances });
  for (const opt of input.depositOptions ?? []) {
    if (opt.amount > 0) lines.push({ label: opt.label, amount: Math.round(opt.amount) });
  }
  if (input.commissionTenantShare && input.commissionTenantShare > 0) {
    lines.push({ label: "Frais de démarcheur (25 % d'un mois de loyer)", amount: input.commissionTenantShare });
  }
  return lines.filter((l) => l.amount > 0);
}

export function sumLines(lines: BreakdownLine[]): number {
  return lines.reduce((acc, l) => acc + l.amount, 0);
}

/** Total d'une réservation de meublé selon le nombre de nuits (prix dégressif jour/semaine/mois). */
export function bookingTotal(input: {
  nights: number;
  dailyPrice?: number | null;
  weeklyPrice?: number | null;
  monthlyPrice?: number | null;
}): number {
  const { nights } = input;
  if (nights <= 0) return 0;
  const daily = input.dailyPrice ?? 0;
  const weekly = input.weeklyPrice ?? 0;
  const monthly = input.monthlyPrice ?? 0;
  // Stratégie : maximiser les blocs les plus longs au meilleur tarif.
  let remaining = nights;
  let total = 0;
  if (monthly > 0 && remaining >= 30) {
    const months = Math.floor(remaining / 30);
    total += months * monthly;
    remaining -= months * 30;
  }
  if (weekly > 0 && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    total += weeks * weekly;
    remaining -= weeks * 7;
  }
  if (remaining > 0 && daily > 0) {
    // si pas de tarif hebdo/mensuel défini, le tarif journalier couvre tout
    total += remaining * (daily > 0 ? daily : 0);
  }
  return total;
}

/**
 * Génère les échéances de loyer d'un bail récurrent.
 * periodCount : mois=1, trimestre=3, semestre=6, bail=mois du bail, jour/semaine → 1.
 */
export function generateRentSchedule(input: {
  startDate: Date;
  endDate?: Date | null;
  monthlyRent: number;
  period: RentPeriod;
  leaseMonths?: number; // pour période LEASE (bail d'au moins 12 mois)
  maxSchedules?: number;
}): Array<{ dueDate: Date; amount: number }> {
  const out: Array<{ dueDate: Date; amount: number }> = [];
  const stepMonths = Math.max(1, Math.round(PERIOD_MONTHS[input.period]));
  const monthlyRent = Math.max(0, Math.round(input.monthlyRent));
  const perPeriod = roundFcfa(monthlyRent * stepMonths);
  const end = input.endDate ?? new Date(input.startDate.getTime() + (input.leaseMonths ?? 12) * 30 * 86400_000);
  let due = new Date(input.startDate.getTime());
  let guard = 0;
  while (due < end && guard < 240) {
    out.push({ dueDate: new Date(due.getTime()), amount: perPeriod });
    const next = new Date(due.getTime());
    next.setMonth(next.getMonth() + stepMonths);
    due = next;
    guard++;
    if (input.maxSchedules && out.length >= input.maxSchedules) break;
  }
  return out;
}

/** Formatage FCFA : « 150 000 FCFA » (espaces insécables fines). */
export function formatFcfa(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount)).replace(/\u202F|\u00A0/g, " ")} FCFA`;
}

/** Formate un montant + période : « 150 000 FCFA / mois ». */
export function formatPricePeriod(amount: number, period: string): string {
  const p: Record<string, string> = { DAY: "jour", WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre", SEMESTER: "semestre", LEASE: "an" };
  return `${formatFcfa(amount)} / ${p[period] ?? "mois"}`;
}

/** Date en français (Africa/Porto-Novo). */
export function formatDate(d: Date | string, withTime = false): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Africa/Porto-Novo",
  }).format(date);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400_000);
}
