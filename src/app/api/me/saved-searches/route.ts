import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  filters: z.record(z.string(), z.unknown()),
  alertsEnabled: z.boolean().default(true),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok(await db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const data = await parseBody(req, createSchema);
    const count = await db.savedSearch.count({ where: { userId: user.id } });
    if (count >= 20) throw new ApiError(400, "Limite de 20 recherches sauvegardées atteinte.");
    const saved = await db.savedSearch.create({
      data: { userId: user.id, name: data.name, filtersJson: JSON.stringify(data.filters), alertsEnabled: data.alertsEnabled },
    });
    return ok(saved);
  });
}

const deleteSchema = z.object({ id: z.string() });

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await parseBody(req, deleteSchema);
    const saved = await db.savedSearch.findUnique({ where: { id } });
    if (!saved || saved.userId !== user.id) throw new ApiError(404, "Recherche introuvable.");
    await db.savedSearch.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
