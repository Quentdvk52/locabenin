import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** Mes immeubles (regroupements d'unités) avec nombre d'offres rattachées. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    const properties = await db.property.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { listings: { where: { deletedAt: null } } } } },
    });

    // Area/commune/département résolus séparément (pas de relation sur Property)
    const areaIds = [...new Set(properties.map((p) => p.areaId).filter((v): v is string => Boolean(v)))];
    const areas = areaIds.length
      ? await db.area.findMany({
          where: { id: { in: areaIds } },
          include: { commune: { include: { department: { select: { name: true } } } } },
        })
      : [];
    const areaById = new Map(areas.map((a) => [a.id, a]));

    return ok(
      properties.map((p) => {
        const area = p.areaId ? areaById.get(p.areaId) : null;
        return {
          id: p.id,
          name: p.name,
          addressText: p.addressText,
          areaId: p.areaId,
          areaName: area?.name ?? null,
          communeName: area?.commune?.name ?? null,
          departmentName: area?.commune?.department?.name ?? null,
          listingsCount: p._count.listings,
          createdAt: p.createdAt,
        };
      }),
    );
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court.").max(120),
  addressText: z.string().trim().min(6, "Adresse trop courte.").max(300),
  areaId: z.string().min(1, "Choisissez un quartier."),
});

/** Création d'un immeuble. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    if (!rateLimit(`property:${user.id}`, 20, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de créations, patientez un peu.");
    }
    const body = await parseBody(req, createSchema);
    const area = await db.area.findUnique({ where: { id: body.areaId }, select: { id: true } });
    if (!area) throw new ApiError(400, "Quartier inconnu.");
    const property = await db.property.create({
      data: { ownerId: user.id, name: body.name, addressText: body.addressText, areaId: body.areaId },
    });
    return ok({ id: property.id, name: property.name });
  });
}
