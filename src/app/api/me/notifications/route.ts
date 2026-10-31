import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return ok({
      unread: items.filter((n) => !n.readAt).length,
      items,
    });
  });
}

const patchSchema = z.object({ id: z.string().optional(), all: z.boolean().optional() });

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { id, all } = await parseBody(req, patchSchema);
    if (all) {
      await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    } else if (id) {
      await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
    }
    return ok({ updated: true });
  });
}
