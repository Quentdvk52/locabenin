// ============================================================
// LocaBénin — /api/admin/users
// GET  ?query=&status=&role=&skip=  → liste paginée (50)
// PATCH { id, action: "suspend"|"activate"|"ban", reason? }
//   Garde : jamais sur un SUPER_ADMIN par un non-super ; un admin
//   ne peut pas modifier son propre compte ni les comptes admin.
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { auditAction, adminRateLimited, adminSubRole, assertCanManageAdminAccount } from "../helpers";

const querySchema = z.object({
  query: z.string().trim().max(80).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "DELETED", "ALL"]).optional(),
  role: z.enum(["OWNER", "TENANT", "AGENT", "ADMIN", "ALL"]).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["suspend", "activate", "ban"]),
  reason: z.string().trim().max(300).optional(),
});

const TAKE = 50;

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    const where = {
      deletedAt: null,
      ...(q.status && q.status !== "ALL" ? { status: q.status } : {}),
      ...(q.role && q.role !== "ALL" ? { userRoles: { some: { role: q.role } } } : {}),
      ...(q.query
        ? {
            OR: [
              { fullName: { contains: q.query } },
              { phone: { contains: q.query } },
              { email: { contains: q.query } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: TAKE,
        skip: q.skip ?? 0,
        include: {
          userRoles: { select: { role: true, adminSubRole: true } },
          _count: { select: { listings: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return ok({
      items: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        phone: u.phone,
        email: u.email,
        avatarUrl: u.avatarUrl,
        status: u.status,
        kycStatus: u.kycStatus,
        createdAt: u.createdAt,
        roles: u.userRoles.map((r) => r.role),
        adminSubRole: u.userRoles.find((r) => r.role === "ADMIN")?.adminSubRole ?? null,
        listingsCount: u._count.listings,
      })),
      total,
      take: TAKE,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("users", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    const target = await db.user.findUnique({
      where: { id: body.id },
      include: { userRoles: true },
    });
    if (!target) throw new ApiError(404, "Utilisateur introuvable.");

    if (target.id === actor.id) {
      throw new ApiError(400, "Vous ne pouvez pas modifier votre propre compte.");
    }

    const actorSub = await adminSubRole(actor.id);
    assertCanManageAdminAccount(actorSub, target.userRoles.map((r) => r.role));

    const targetSub = target.userRoles.find((r) => r.role === "ADMIN")?.adminSubRole ?? null;
    if (targetSub === "SUPER_ADMIN" && actorSub !== "SUPER_ADMIN") {
      throw new ApiError(403, "Un compte Super admin ne peut être modifié que par un autre Super admin.");
    }

    const nextStatus = body.action === "suspend" ? "SUSPENDED" : body.action === "ban" ? "BANNED" : "ACTIVE";
    const updated = await db.user.update({ where: { id: target.id }, data: { status: nextStatus } });

    const actionLabel = body.action === "suspend" ? "suspendu" : body.action === "ban" ? "banni" : "réactivé";
    await sendNotification({
      userId: target.id,
      type: "SYSTEM",
      title: `Votre compte a été ${actionLabel}`,
      body: body.reason
        ? `Motif : ${body.reason}`
        : "Contactez le support LocaBénin si vous pensez qu'il s'agit d'une erreur.",
    });

    await auditAction({
      actorId: actor.id,
      action: body.action === "suspend" ? "USER_SUSPEND" : body.action === "ban" ? "USER_BAN" : "USER_ACTIVATE",
      entityType: "User",
      entityId: target.id,
      meta: { reason: body.reason ?? null, nextStatus, targetRoles: target.userRoles.map((r) => r.role) },
      ip: meta.ip,
    });

    return ok({ id: updated.id, status: updated.status });
  });
}
