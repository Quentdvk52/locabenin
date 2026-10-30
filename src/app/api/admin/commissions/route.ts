// ============================================================
// LocaBénin — /api/admin/commissions
// GET   ?status= → commissions démarcheur (agent + offre + parts)
// PATCH { id, action: "validate"|"cancel", reason? }
//   validate → VALIDATED + validatedAt (uniquement si validatableAt
//              est dépassé — période anti-fraude)
//   cancel   → CANCELLED (fraudFlag = motif) + audit
// (Le paiement du démarcheur se fait via les retraits / payouts.)
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { formatFcfa, formatDate } from "@/lib/finance";
import { auditAction, adminRateLimited } from "../helpers";

const querySchema = z.object({
  status: z.string().trim().max(30).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["validate", "cancel"]),
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    const where = q.status && q.status !== "ALL" ? { status: q.status } : {};
    const [commissions, total] = await Promise.all([
      db.commission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.take ?? 100,
        include: {
          agent: { select: { id: true, fullName: true, phone: true, kycStatus: true } },
          listing: { select: { id: true, title: true, reference: true } },
          lease: { select: { reference: true } },
        },
      }),
      db.commission.count({ where }),
    ]);

    return ok({
      items: commissions.map((c) => ({
        id: c.id,
        agent: c.agent,
        listing: c.listing,
        leaseRef: c.lease?.reference ?? null,
        tenantShare: c.tenantShare,
        ownerShare: c.ownerShare,
        total: c.total,
        status: c.status,
        validatableAt: c.validatableAt,
        validatedAt: c.validatedAt,
        paidAt: c.paidAt,
        fraudFlag: c.fraudFlag,
        createdAt: c.createdAt,
      })),
      total,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("commissions", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    const commission = await db.commission.findUnique({
      where: { id: body.id },
      include: { listing: { select: { title: true } } },
    });
    if (!commission) throw new ApiError(404, "Commission introuvable.");

    if (body.action === "validate") {
      if (commission.status !== "PENDING_VALIDATION") {
        throw new ApiError(400, `Seule une commission en validation peut être validée (statut actuel : ${commission.status}).`);
      }
      if (commission.validatableAt > new Date()) {
        throw new ApiError(400, `Période anti-fraude en cours : cette commission ne sera validable qu'à partir du ${formatDate(commission.validatableAt)}.`);
      }
      const updated = await db.commission.update({
        where: { id: commission.id },
        data: { status: "VALIDATED", validatedAt: new Date() },
      });
      await sendNotification({
        userId: commission.agentId,
        type: "COMMISSION",
        title: "Commission validée ✓",
        body: `Votre commission de ${formatFcfa(commission.total)} (${commission.listing.title}) est validée : le montant est désormais retirable depuis votre portefeuille.`,
        linkHash: "#/demarcheur/wallet",
      });
      await auditAction({
        actorId: actor.id,
        action: "COMMISSION_VALIDATE",
        entityType: "Commission",
        entityId: commission.id,
        meta: { agentId: commission.agentId, total: commission.total, listing: commission.listing.title },
        ip: meta.ip,
      });
      return ok({ id: updated.id, status: updated.status, validatedAt: updated.validatedAt });
    }

    // cancel
    if (!["PENDING_VALIDATION", "VALIDATED"].includes(commission.status)) {
      throw new ApiError(400, `Cette commission ne peut plus être annulée (statut actuel : ${commission.status}).`);
    }
    if (!body.reason?.trim()) throw new ApiError(400, "Un motif d'annulation est obligatoire (anti-fraude).");

    const updated = await db.commission.update({
      where: { id: commission.id },
      data: { status: "CANCELLED", fraudFlag: body.reason.trim() },
    });
    await sendNotification({
      userId: commission.agentId,
      type: "COMMISSION",
      title: "Commission annulée",
      body: `La commission de ${formatFcfa(commission.total)} (${commission.listing.title}) a été annulée par l'administration. Motif : ${body.reason.trim()}.`,
      linkHash: "#/demarcheur/commissions",
    });
    await auditAction({
      actorId: actor.id,
      action: "COMMISSION_CANCEL",
      entityType: "Commission",
      entityId: commission.id,
      meta: { agentId: commission.agentId, total: commission.total, reason: body.reason.trim() },
      ip: meta.ip,
    });
    return ok({ id: updated.id, status: updated.status });
  });
}
