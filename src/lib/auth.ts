// ============================================================
// LocaBénin — Authentification & sessions
// Sessions : cookie httpOnly signé HMAC-SHA256 (stateless).
// Production Supabase : remplacer par Supabase Auth (voir docs/DECISIONS.md).
// ============================================================

import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import type { Role } from "./constants";

const SESSION_COOKIE = "lb_session";
const ROLE_COOKIE = "lb_role";
const VISITOR_COOKIE = "lb_vid";
const SESSION_TTL_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET manquante ou trop courte");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface SessionData {
  uid: string;
  issuedAt: number;
  exp: number;
}

export function encodeSession(uid: string): string {
  const data: SessionData = { uid, issuedAt: Date.now(), exp: Date.now() + SESSION_TTL_DAYS * 86400_000 };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): SessionData | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Comparaison à temps constant (anti timing-attack)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
    if (!data.uid || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  whatsapp: string | null;
  kycStatus: string;
  status: string;
  roles: Role[];
  activeRole: Role;
  isAdmin: boolean;
}

/** Récupère l'utilisateur de la session courante (ou null). Utilisé par toutes les routes API. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.uid },
    include: { userRoles: true },
  });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
  const roles = user.userRoles.map((r) => r.role) as Role[];
  if (roles.length === 0) return null;
  const cookieRole = store.get(ROLE_COOKIE)?.value as Role | undefined;
  const activeRole = cookieRole && roles.includes(cookieRole) ? cookieRole : (user.userRoles.find((r) => r.isDefault)?.role as Role) ?? roles[0];
  return {
    id: user.id, fullName: user.fullName, phone: user.phone, email: user.email,
    avatarUrl: user.avatarUrl, whatsapp: user.whatsapp, kycStatus: user.kycStatus,
    status: user.status, roles, activeRole, isAdmin: roles.includes("ADMIN"),
  };
}

export async function setSessionCookies(uid: string, role: Role) {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(uid), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: SESSION_TTL_DAYS * 86400, path: "/",
  });
  store.set(ROLE_COOKIE, role, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: SESSION_TTL_DAYS * 86400, path: "/",
  });
}

export async function setActiveRoleCookie(role: Role) {
  const store = await cookies();
  store.set(ROLE_COOKIE, role, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: SESSION_TTL_DAYS * 86400, path: "/",
  });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ROLE_COOKIE);
}

// ---------- Mots de passe (scrypt, sel aléatoire) ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

// ---------- OTP ----------

const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SEND_LIMIT_PER_10MIN = 3;

/** Génère et « envoie » un OTP. En sandbox : canal log (le code est retourné pour l'UI dev). */
export async function createOtp(destination: string, purpose: "AUTH" | "PAYOUT" | "SENSITIVE" = "AUTH") {
  const tenMinAgo = new Date(Date.now() - 10 * 60_000);
  const recent = await db.otpCode.count({
    where: { destination, purpose, createdAt: { gte: tenMinAgo } },
  });
  if (recent >= OTP_SEND_LIMIT_PER_10MIN) {
    throw Object.assign(new Error("Trop de codes envoyés. Réessayez dans quelques minutes."), { status: 429 });
  }
  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = crypto.createHmac("sha256", secret()).update(`${destination}:${code}`).digest("hex");
  await db.otpCode.deleteMany({ where: { destination, purpose, consumedAt: null } });
  await db.otpCode.create({
    data: { destination, codeHash, purpose, expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) },
  });
  // Canal de notification : en production → SMS (Africa's Talking) / email (Resend).
  // En sandbox, le code est journalisé et renvoyé à l'UI (mode dev uniquement).
  console.log(`[OTP] ${purpose} → ${destination} : ${code}`);
  return { devCode: code, destination, ttlMin: OTP_TTL_MIN };
}

export async function verifyOtp(destination: string, code: string, purpose: "AUTH" | "PAYOUT" | "SENSITIVE" = "AUTH"): Promise<boolean> {
  const otp = await db.otpCode.findFirst({
    where: { destination, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;
  if (otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) return false;
  const codeHash = crypto.createHmac("sha256", secret()).update(`${destination}:${code}`).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(codeHash));
  if (ok) {
    await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  } else {
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
  }
  return ok;
}

// ---------- Visiteur (attribution affiliation) ----------

export async function getOrCreateVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;
  const vid = crypto.randomUUID();
  store.set(VISITOR_COOKIE, vid, {
    httpOnly: false, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", maxAge: 365 * 86400, path: "/",
  });
  return vid;
}

export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  return store.get(VISITOR_COOKIE)?.value ?? null;
}
