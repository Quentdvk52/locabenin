// ============================================================
// LocaBénin — /api/admin/payouts
// GET   ?status= → demandes de retrait (avec utilisateur + rôle)
// PATCH { id, action: "approve"|"reject", reason? }
//   approve → completePayout() de lib/payments (écriture ledger
//             en partie double, idempotente) → statut PAID
//   reject  → REJECTED + motif + notification + audit
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { completePayout } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { sendNotification } from "@/lib/notifications";
import { formatFcfa } from "@/lib/finance";
import { auditAction, adminRateLimited } from "../helpers";

const querySchema = z.object({
  status: z.string().trim().max(20).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    const where = q.status && q.status !== "ALL" ? { status: q.status } : {};
    const [payouts, total, settings] = await Promise.all([
      db.payout.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: q.take ?? 100,
        include: {
          user: {
            select: {
              id: true, fullName: true, phone: true, kycStatus: true,
              userRoles: { select: { role: true } },
            },
          },
        },
      }),
      db.payout.count({ where }),
      getSettings(),
    ]);

    return ok({
      items: payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        destination: p.destination,
        status: p.status,
        otpVerified: p.otpVerified,
        rejectionReason: p.rejectionReason,
        createdAt: p.createdAt,
        processedAt: p.processedAt,
        user: {
          id: p.user.id,
          fullName: p.user.fullName,
          phone: p.user.phone,
          kycStatus: p.user.kycStatus,
          role: p.userRole,
          roles: p.user.userRoles.map((r) => r.role),
        },
      })),
      total,
      settings: { autoThreshold: settings.payoutAutoApprovalThreshold, minAmount: settings.payoutMinAmount },
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("payouts", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    const payout = await db.payout.findUnique({ where: { id: body.id } });
    if (!payout) throw new ApiError(404, "Demande de retrait introuvable.");
    if (!["OTP_PENDING", "REQUESTED"].includes(payout.status)) {
      throw new ApiError(400, `Ce retrait est déjà traité (statut : ${payout.status}).`);
    }

    if (body.action === "approve") {
      // completePayout : écriture ledger en partie double idempotente
      // (clé `payout:{id}`) + statut PAID + notification utilisateur.
      const done = await completePayout(payout.id, `Retrait ${payout.method} ${payout.destination} — approuvé par l'administration`);
      await auditAction({
        actorId: actor.id,
        action: "PAYOUT_APPROVE",
        entityType: "Payout",
        entityId: payout.id,
        meta: { amount: payout.amount, method: payout.method, destination: payout.destination, userId: payout.userId },
        ip: meta.ip,
      });
      return ok({ id: done.id, status: done.status });
    }

    // reject
    if (!body.reason?.trim()) throw new ApiError(400, "Un motif de rejet est obligatoire.");
    const rejected = await db.payout.update({
      where: { id: payout.id },
      data: { status: "REJECTED", rejectionReason: body.reason.trim(), reviewedById: actor.id, reviewedAt: new Date(), processedAt: new Date() },
    });
    await sendNotification({
      userId: payout.userId,
      type: "PAYMENT",
      title: "Demande de retrait rejetée",
      body: `Votre demande de ${formatFcfa(payout.amount)} vers ${payout.destination} a été rejetée. Motif : ${body.reason.trim()}. Le montant reste disponible sur votre portefeuille.`,
      linkHash: payout.userRole === "AGENT" ? "#/demarcheur/wallet" : "#/proprietaire/finances",
    });
    await auditAction({
      actorId: actor.id,
      action: "PAYOUT_REJECT",
      entityType: "Payout",
      entityId: payout.id,
      meta: { amount: payout.amount, reason: body.reason.trim(), userId: payout.userId },
      ip: meta.ip,
    });
    return ok({ id: rejected.id, status: rejected.status });
  });
}
