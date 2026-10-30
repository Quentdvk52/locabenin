// ============================================================
// LocaBénin — /api/admin/settings (paramétrage sans code)
// GET → { settings (getSettings), pricing (getCategoryPricing) }
// PUT → { patch? (AppSettings partiel), pricing? (upsert) }
//       + audit SETTING_UPDATE (immédiat, sans redéploiement).
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { getSettings, updateSettings, getCategoryPricing, type AppSettings } from "@/lib/settings";
import { LISTING_TYPES, LISTING_CATEGORIES } from "@/lib/constants";
import { auditAction, adminRateLimited } from "../helpers";

const patchSchema = z
  .object({
    commissionTenantSharePct: z.number().int().min(0).max(100),
    commissionOwnerSharePct: z.number().int().min(0).max(100),
    affiliateWindowDays: z.number().int().min(1).max(365),
    affiliateAttribution: z.enum(["last_click", "first_click"]),
    commissionValidationDays: z.number().int().min(0).max(90),
    commissionMinDurationMonths: z.number().int().min(0).max(24),
    subscriptionGraceDays: z.number().int().min(0).max(60),
    payoutAutoApprovalThreshold: z.number().int().min(0).max(10_000_000),
    payoutMinAmount: z.number().int().min(0).max(1_000_000),
    autoPublishListings: z.boolean(),
    typeCategoryMapping: z.record(z.enum(LISTING_TYPES), z.enum(LISTING_CATEGORIES)),
  })
  .partial();

const pricingSchema = z.object({
  category: z.enum(LISTING_CATEGORIES),
  monthlyPrice: z.number().int().min(0).max(10_000_000),
  label: z.string().trim().min(2).max(80),
});

const putSchema = z.object({
  patch: patchSchema.optional(),
  pricing: z.array(pricingSchema).max(10).optional(),
});

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const [settings, pricing] = await Promise.all([getSettings(), getCategoryPricing()]);
    return ok({ settings, pricing });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("settings", actor.id)) throw new ApiError(429, "Trop d'enregistrements. Patientez un instant.");
    const body = await parseBody(req, putSchema);
    const meta = getClientMeta(req);

    if (!body.patch && !body.pricing) {
      throw new ApiError(400, "Rien à enregistrer : fournissez un patch de paramètres et/ou des tarifs.");
    }

    const changedKeys: string[] = [];
    let settings: AppSettings | null = null;
    if (body.patch) {
      settings = await updateSettings(body.patch as Partial<AppSettings>);
      changedKeys.push(...Object.keys(body.patch));
    }

    let pricingCount = 0;
    if (body.pricing) {
      for (const p of body.pricing) {
        await db.categoryPricing.upsert({
          where: { category: p.category },
          create: { category: p.category, monthlyPrice: p.monthlyPrice, label: p.label },
          update: { monthlyPrice: p.monthlyPrice, label: p.label },
        });
        pricingCount += 1;
      }
    }

    await auditAction({
      actorId: actor.id,
      action: "SETTING_UPDATE",
      entityType: "AdminSetting",
      entityId: "app_settings",
      meta: { patchKeys: changedKeys, pricingCount },
      ip: meta.ip,
    });

    const pricing = await getCategoryPricing();
    return ok({ settings: settings ?? (await getSettings()), pricing });
  });
}
