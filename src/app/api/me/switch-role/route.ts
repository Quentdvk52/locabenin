import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody } from "@/lib/api";
import { requireUser, requireAdmin } from "@/lib/api";
import { setActiveRoleCookie } from "@/lib/auth";
import type { Role } from "@/lib/constants";

const schema = z.object({ role: z.enum(["OWNER", "TENANT", "AGENT", "ADMIN"] as const) });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { role } = await parseBody(req, schema);
    if (role === "ADMIN") {
      await requireAdmin(); // seul un admin peut activer l'espace admin
    } else if (!user.roles.includes(role)) {
      return ok({ switched: false, error: "Rôle non détenu. Ajoutez-le d'abord depuis votre profil." });
    }
    await setActiveRoleCookie(role as Role);
    return ok({ switched: true, activeRole: role });
  });
}
