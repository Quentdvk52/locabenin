// ============================================================
// LocaBénin — Helpers internes du namespace /api/admin
// Journalisation d'audit systématique + garde hiérarchique admin.
// (Fichier interne : n'est PAS une route, seul route.ts expose.)
// ============================================================

import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import type { Role } from "@/lib/constants";

/** Écrit une entrée du journal d'audit (toute écriture admin passe ici). */
export async function auditAction(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
      ip: input.ip ?? null,
    },
  });
}

/** Sous-rôle admin de l'utilisateur (SUPER_ADMIN, MODERATOR… ou null). */
export async function adminSubRole(userId: string): Promise<string | null> {
  const ur = await db.userRole.findFirst({
    where: { userId, role: "ADMIN" },
    select: { adminSubRole: true },
  });
  return ur?.adminSubRole ?? null;
}

/**
 * Garde hiérarchique : seul un SUPER_ADMIN peut agir sur un compte ADMIN.
 * `targetRoles` : rôles du compte ciblé. Lève une ApiError sinon.
 */
export function assertCanManageAdminAccount(
  actorSubRole: string | null,
  targetRoles: readonly string[],
): void {
  if (targetRoles.includes("ADMIN") && actorSubRole !== "SUPER_ADMIN") {
    throw new ApiError(403, "Seul un Super admin peut agir sur un compte administrateur.");
  }
}

/** Rôles d'un utilisateur (helper réutilisé par users/kyc/payouts). */
export async function rolesOf(userId: string): Promise<{ roles: Role[]; adminSubRole: string | null }> {
  const urs = await db.userRole.findMany({ where: { userId }, select: { role: true, adminSubRole: true } });
  return {
    roles: urs.map((u) => u.role) as Role[],
    adminSubRole: urs.find((u) => u.role === "ADMIN")?.adminSubRole ?? null,
  };
}

/** Normalise un titre pour la détection de doublons (lowercase, trim, espaces réduits). */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Applique le rate-limit admin (60 écritures / minute par admin et par action). */
export function adminRateLimited(bucket: string, adminId: string): boolean {
  return !rateLimit(`admin:${bucket}:${adminId}`, 60, 60_000);
}
