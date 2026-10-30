// ============================================================
// LocaBénin — /api/admin/geo (rattachement géographique)
// GET    → départements → communes → quartiers (+ count offres)
// POST   { communeId, name } → crée un quartier (Area)
// DELETE ?areaId= → suppression dure (409 si des offres y sont
//                   rattachées — pas de soft delete sur la géo)
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { auditAction, adminRateLimited } from "../helpers";

const postSchema = z.object({
  communeId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
});

const deleteSchema = z.object({
  areaId: z.string().min(1),
});

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const departments = await db.department.findMany({
      orderBy: { code: "asc" },
      include: {
        communes: {
          orderBy: { name: "asc" },
          include: {
            areas: {
              orderBy: { name: "asc" },
              include: { _count: { select: { listings: true } } },
            },
          },
        },
      },
    });
    return ok({
      departments: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        communes: d.communes.map((c) => ({
          id: c.id,
          name: c.name,
          areas: c.areas.map((a) => ({ id: a.id, name: a.name, kind: a.kind, listingsCount: a._count.listings })),
        })),
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("geo", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, postSchema);
    const meta = getClientMeta(req);

    const commune = await db.commune.findUnique({
      where: { id: body.communeId },
      include: { department: { select: { name: true } } },
    });
    if (!commune) throw new ApiError(404, "Commune introuvable.");

    const existing = await db.area.findUnique({
      where: { communeId_name: { communeId: body.communeId, name: body.name } },
    });
    if (existing) {
      throw new ApiError(409, `Le quartier « ${body.name} » existe déjà dans ${commune.name}.`);
    }

    const area = await db.area.create({
      data: { communeId: body.communeId, name: body.name, kind: "QUARTIER" },
      include: { commune: { select: { name: true } } },
    });

    await auditAction({
      actorId: actor.id,
      action: "GEO_AREA_CREATE",
      entityType: "Area",
      entityId: area.id,
      meta: { name: area.name, commune: commune.name, department: commune.department.name },
      ip: meta.ip,
    });

    return ok({ id: area.id, name: area.name, commune: area.commune.name });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("geo", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const q = parseQuery(req, deleteSchema);
    const meta = getClientMeta(req);

    const area = await db.area.findUnique({
      where: { id: q.areaId },
      include: { commune: { select: { name: true } }, _count: { select: { listings: true } } },
    });
    if (!area) throw new ApiError(404, "Quartier introuvable.");

    if (area._count.listings > 0) {
      throw new ApiError(409, `Suppression impossible : ${area._count.listings} offre(s) sont rattachée(s) au quartier « ${area.name} ». Réaffectez-les d'abord.`);
    }

    await db.area.delete({ where: { id: area.id } });

    await auditAction({
      actorId: actor.id,
      action: "GEO_AREA_DELETE",
      entityType: "Area",
      entityId: area.id,
      meta: { name: area.name, commune: area.commune.name },
      ip: meta.ip,
    });

    return ok({ deleted: true, id: area.id });
  });
}
