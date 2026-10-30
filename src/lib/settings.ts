// ============================================================
// LocaBénin — Paramètres administrables SANS CODE
// Chaque paramètre vit en base (AdminSetting) avec une valeur par défaut :
// le back-office peut tout modifier sans redéploiement.
// ============================================================

import "server-only";
import { db } from "./db";
import { DEFAULT_TYPE_CATEGORY, type ListingCategory, type ListingType } from "./constants";

export interface AppSettings {
  /** Part locataire de la commission démarcheur (% d'un mois de loyer) */
  commissionTenantSharePct: number;
  /** Part propriétaire de la commission démarcheur (% d'un mois) */
  commissionOwnerSharePct: number;
  /** Fenêtre de validité de l'affiliation (jours, dernier clic prime) */
  affiliateWindowDays: number;
  /** Politique d'attribution : last_click (défaut) ou first_click */
  affiliateAttribution: "last_click" | "first_click";
  /** Période de validation avant retrait des commissions (jours) */
  commissionValidationDays: number;
  /** Commission active seulement si la durée de location ≥ N mois (meublés) */
  commissionMinDurationMonths: number;
  /** Jours de grâce après échéance d'abonnement avant masquage des offres */
  subscriptionGraceDays: number;
  /** Seuil (FCFA) en dessous duquel un retrait est approuvé automatiquement */
  payoutAutoApprovalThreshold: number;
  /** Montant minimum de retrait */
  payoutMinAmount: number;
  /** Publication automatique des offres sans modération */
  autoPublishListings: boolean;
  /** Rattachement type de bien → catégorie d'abonnement (modifiable) */
  typeCategoryMapping: Record<string, ListingCategory>;
}

const DEFAULTS: AppSettings = {
  commissionTenantSharePct: 25,
  commissionOwnerSharePct: 25,
  affiliateWindowDays: 30,
  affiliateAttribution: "last_click",
  commissionValidationDays: 7,
  commissionMinDurationMonths: 1, // meublés < 1 mois : PAS de commission (hypothèse documentée)
  subscriptionGraceDays: 5,
  payoutAutoApprovalThreshold: 50_000,
  payoutMinAmount: 2_000,
  autoPublishListings: false,
  typeCategoryMapping: { ...DEFAULT_TYPE_CATEGORY },
};

const SETTING_KEY = "app_settings";

export async function getSettings(): Promise<AppSettings> {
  const row = await db.adminSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(row.valueJson) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed, typeCategoryMapping: { ...DEFAULTS.typeCategoryMapping, ...(parsed.typeCategoryMapping ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...patch };
  if (patch.typeCategoryMapping) {
    next.typeCategoryMapping = { ...current.typeCategoryMapping, ...patch.typeCategoryMapping };
  }
  await db.adminSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(next), label: "Paramètres généraux", group: "FINANCE" },
    update: { valueJson: JSON.stringify(next) },
  });
  return next;
}

/** Tarifs d'abonnement par catégorie (table dédiée, éditable sans code). */
export async function getCategoryPricing() {
  const rows = await db.categoryPricing.findMany({ orderBy: { category: "asc" } });
  return rows;
}

export function categoryForType(type: string, settings: AppSettings): ListingCategory {
  return settings.typeCategoryMapping[type] ?? "EMPTY_HOUSING";
}
