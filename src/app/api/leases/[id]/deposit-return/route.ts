import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";

const depositSchema = z.object({
  amount: z.number().int().min(0),
  deductions: z.array(z.object({ label: z.string().max(80), amount: z.number().int().min(0) })).max(10).default([]),
  inventoryOutUrl: z.string().optional(),
});

/**
 * Restitution de caution (fin de bail) : le propriétaire saisit le montant
 * rendu et les retenues justifiées (état des lieux de sortie). Le locataire
 * reçoit une notification détaillée ; un litige reste possible via le support.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await parseBody(req, depositSchema);
    const lease = await db.lease.findUnique({ where: { id } });
    if (!lease) return fail(404, "Bail introuvable.");
    if (lease.ownerId !== user.id) throw new ApiError(403, "Seul le propriétaire peut restituer la caution.");
    if (body.amount > lease.depositAmount) throw new ApiError(400, "Le montant restitué dépasse la caution enregistrée.");
    await db.lease.update({
      where: { id },
      data: {
        depositReturnedAmount: body.amount,
        depositReturnedAt: new Date(),
        inventoryOutUrl: body.inventoryOutUrl ?? null,
        status: body.amount >= lease.depositAmount ? "TERMINATED" : lease.status,
      },
    });
    const deductionLines = body.deductions.map((d) => `${d.label} : ${d.amount} FCFA`).join(", ");
    await sendNotification({
      userId: lease.tenantId, type: "PAYMENT", title: "Caution restituée",
      body: `Caution restituée : ${body.amount} FCFA.${deductionLines ? ` Retenues : ${deductionLines}.` : ""}`,
      linkHash: "#/locataire/bail",
    });
    return ok({ returned: true });
  });
}

/** État des lieux de sortie : clôture du bail. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const lease = await db.lease.findUnique({ where: { id }, include: { listing: true } });
    if (!lease) return fail(404, "Bail introuvable.");
    if (lease.ownerId !== user.id) throw new ApiError(403, "Seul le propriétaire peut clôturer le bail.");
    await db.lease.update({ where: { id }, data: { status: "TERMINATED" } });
    await db.listing.update({ where: { id: lease.listingId }, data: { status: "PUBLISHED", publishedAt: new Date() } }).catch(() => {});
    return ok({ terminated: true });
  });
}
