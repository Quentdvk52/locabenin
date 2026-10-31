import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, fail, getClientMeta } from "@/lib/api";
import { verifyOtp, setSessionCookies, getOrCreateVisitorId } from "@/lib/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { ROLES, type Role } from "@/lib/constants";

const schema = z.object({
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  code: z.string().regex(/^[0-9]{6}$/, "Code à 6 chiffres requis."),
  fullName: z.string().min(2).max(80).optional(),
  role: z.enum(["OWNER", "TENANT", "AGENT"]).optional(),
  // Anti-fraude affiliation : le visiteur qui s'inscrit via un lien démarcheur
  visitorId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await parseBody(req, schema);
    const meta = getClientMeta(req);
    if (!rateLimit(`otpver:${meta.ip}`, RATE_LIMITS.otpVerify.limit, RATE_LIMITS.otpVerify.windowMs)) {
      return fail(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    const valid = await verifyOtp(body.phone, body.code, "AUTH");
    if (!valid) return fail(401, "Code invalide ou expiré.");

    let user = await db.user.findUnique({ where: { phone: body.phone }, include: { userRoles: true } });
    if (user && ["BANNED", "DELETED"].includes(user.status)) {
      return fail(403, "Ce compte est désactivé. Contactez le support.");
    }
    if (!user) {
      // Inscription gratuite par téléphone — un rôle est requis à la création
      const role: Role = (body.role ?? "TENANT") as Role;
      user = await db.user.create({
        data: {
          phone: body.phone,
          fullName: body.fullName ?? "Utilisateur LocaBénin",
          phoneVerified: true,
          userRoles: { create: [{ role, isDefault: true }] },
        },
        include: { userRoles: true },
      });
    } else if (!user.phoneVerified) {
      await db.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
    }
    if (user.userRoles.length === 0) {
      await db.userRole.create({ data: { userId: user.id, role: body.role ?? "TENANT", isDefault: true } });
      user = await db.user.findUnique({ where: { id: user.id }, include: { userRoles: true } });
    }
    if (!user) return fail(500, "Compte introuvable après mise à jour. Reconnectez-vous.");
    const activeRole = (user.userRoles.find((r) => r.isDefault)?.role ?? user.userRoles[0].role) as Role;
    await setSessionCookies(user.id, activeRole);
    // Lien cookie visiteur ↔ utilisateur (anti-fraude : bloque l'auto-parrainage au clic)
    await getOrCreateVisitorId();
    return ok({
      id: user.id, fullName: user.fullName, isNew: user.createdAt > new Date(Date.now() - 60_000),
      roles: user.userRoles.map((r) => r.role), activeRole,
    });
  });
}
