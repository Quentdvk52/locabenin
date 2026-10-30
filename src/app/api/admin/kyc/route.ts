// ============================================================
// LocaBénin — /api/admin/kyc
// GET   ?status=PENDING → utilisateurs avec documents en attente
//       (sinon : historique des documents, 200 derniers)
// PATCH { userId, decision: "APPROVED"|"REJECTED", reason? }
//   → met à jour TOUS les documents PENDING du user + user.kycStatus
//   → notification KYC + audit.
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { formatDate } from "@/lib/finance";
import { auditAction, adminRateLimited, rolesOf } from "../helpers";

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional(),
});

const patchSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    if (!q.status || q.status === "PENDING") {
      // File de validation : utilisateurs ayant au moins un document PENDING
      const docs = await db.kycDocument.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, fullName: true, phone: true, avatarUrl: true, kycStatus: true, createdAt: true, deletedAt: true } } },
      });
      const groups = new Map<string, {
        user: { id: string; fullName: string; phone: string | null; avatarUrl: string | null; kycStatus: string; createdAt: Date };
        docs: Array<{ id: string; kind: string; fileUrl: string; status: string; createdAt: Date }>;
      }>();
      for (const d of docs) {
        if (d.user.deletedAt) continue;
        const g = groups.get(d.userId) ?? { user: { id: d.user.id, fullName: d.user.fullName, phone: d.user.phone, avatarUrl: d.user.avatarUrl, kycStatus: d.user.kycStatus, createdAt: d.user.createdAt }, docs: [] };
        g.docs.push({ id: d.id, kind: d.kind, fileUrl: d.fileUrl, status: d.status, createdAt: d.createdAt });
        groups.set(d.userId, g);
      }
      return ok({ mode: "PENDING" as const, groups: [...groups.values()] });
    }

    // Historique : documents triés du plus récent au plus ancien
    const docs = await db.kycDocument.findMany({
      where: q.status === "ALL" ? {} : { status: q.status },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, fullName: true, phone: true } } },
    });
    return ok({
      mode: "HISTORY" as const,
      docs: docs.map((d) => ({
        id: d.id, kind: d.kind, fileUrl: d.fileUrl, status: d.status,
        rejectionReason: d.rejectionReason, createdAt: d.createdAt, reviewedAt: d.reviewedAt,
        user: d.user,
      })),
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("kyc", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    if (body.decision === "REJECTED" && !body.reason?.trim()) {
      throw new ApiError(400, "Un motif de refus est obligatoire.");
    }

    const target = await db.user.findUnique({ where: { id: body.userId }, include: { userRoles: true } });
    if (!target) throw new ApiError(404, "Utilisateur introuvable.");

    const pendingDocs = await db.kycDocument.findMany({ where: { userId: body.userId, status: "PENDING" } });
    if (pendingDocs.length === 0) {
      throw new ApiError(400, "Aucun document en attente pour cet utilisateur.");
    }

    const now = new Date();
    await db.$transaction([
      db.kycDocument.updateMany({
        where: { userId: body.userId, status: "PENDING" },
        data: {
          status: body.decision,
          rejectionReason: body.decision === "REJECTED" ? body.reason!.trim() : null,
          reviewedById: actor.id,
          reviewedAt: now,
        },
      }),
      db.user.update({
        where: { id: body.userId },
        data: { kycStatus: body.decision === "APPROVED" ? "VERIFIED" : "REJECTED" },
      }),
    ]);

    const { roles } = await rolesOf(body.userId);
    const isOwnerOrAgent = roles.some((r) => ["OWNER", "AGENT"].includes(r));
    await sendNotification({
      userId: body.userId,
      type: "KYC",
      title: body.decision === "APPROVED" ? "Identité vérifiée ✓" : "Vérification d'identité refusée",
      body:
        body.decision === "APPROVED"
          ? "Vos documents ont été validés. Vous avez désormais accès à toutes les fonctionnalités (retraits, contrats, démarche)."
          : `Motif : ${body.reason!.trim()}. Vous pouvez soumettre de nouveaux documents depuis votre profil.`,
      linkHash: isOwnerOrAgent ? "#/compte" : "#/locataire/profil",
    });

    await auditAction({
      actorId: actor.id,
      action: body.decision === "APPROVED" ? "KYC_APPROVE" : "KYC_REJECT",
      entityType: "User",
      entityId: body.userId,
      meta: { docsCount: pendingDocs.length, reason: body.reason ?? null, reviewedAt: now.toISOString() },
      ip: meta.ip,
    });

    return ok({
      userId: body.userId,
      kycStatus: body.decision === "APPROVED" ? "VERIFIED" : "REJECTED",
      docsUpdated: pendingDocs.length,
      decidedAt: formatDate(now, true),
    });
  });
}
