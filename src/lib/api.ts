// ============================================================
// LocaBénin — Helpers API : enveloppe de réponse, erreurs, garde d'accès
// Toutes les routes API passent par ici : validation Zod systématique,
// contrôle de rôle serveur, anti-IDOR par vérification de propriété.
// ============================================================

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { getSessionUser, type SessionUser } from "./auth";
import type { Role } from "./constants";
import { db } from "./db";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Enveloppe un handler : toute erreur métier devient une réponse propre (sans fuite interne). */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message);
    console.error("[API]", e);
    return fail(500, "Une erreur interne est survenue. Réessayez.");
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Connectez-vous pour continuer.");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.some((r) => user.roles.includes(r))) {
    throw new ApiError(403, "Accès non autorisé pour votre rôle.");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.roles.includes("ADMIN")) throw new ApiError(403, "Accès réservé à l'administration.");
  return user;
}

/** Validation Zod stricte du corps JSON. */
export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Corps de requête invalide.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".");
    throw new ApiError(400, field ? `Champ « ${field} » : ${first.message}` : first?.message ?? "Données invalides.");
  }
  return parsed.data;
}

export function parseQuery<T>(req: NextRequest, schema: ZodSchema<T>): T {
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { raw[k] = v; });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, first?.message ?? "Paramètres invalides.");
  }
  return parsed.data;
}

/** Anti-IDOR : vérifie que la ressource appartient bien à l'utilisateur. */
export async function assertListingOwnership(listingId: string, userId: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } });
  if (!listing) throw new ApiError(404, "Offre introuvable.");
  if (listing.ownerId !== userId) throw new ApiError(403, "Cette offre ne vous appartient pas.");
  return listing;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export function getClientMeta(req: NextRequest) {
  return {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent") ?? "",
  };
}
