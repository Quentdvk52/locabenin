// ============================================================
// LocaBénin — GET /api/admin/audit
// ?stats=1          → counts par action (chips)
// ?action=&take=&skip= → journal paginé (acteur + metaJson parsé)
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseQuery, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";

const querySchema = z.object({
  action: z.string().trim().max(50).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  stats: z.string().optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);
    const url = new URL(req.url);

    if (q.stats === "1" || url.searchParams.get("stats") === "1") {
      const rows = await db.auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { _count: { action: "desc" } } });
      return ok({
        stats: rows.map((r) => ({ action: r.action, count: r._count._all })),
      });
    }

    const take = q.take ?? 100;
    const where = q.action && q.action !== "ALL" ? { action: q.action } : {};
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip: q.skip ?? 0,
        include: { actor: { select: { id: true, fullName: true } } },
      }),
      db.auditLog.count({ where }),
    ]);

    return ok({
      items: logs.map((l) => {
        let meta: Record<string, unknown> | null = null;
        if (l.metaJson) {
          try { meta = JSON.parse(l.metaJson) as Record<string, unknown>; } catch { meta = { raw: l.metaJson }; }
        }
        return {
          id: l.id,
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          meta,
          ip: l.ip,
          createdAt: l.createdAt,
          actor: l.actor ? { id: l.actor.id, fullName: l.actor.fullName } : null,
        };
      }),
      total,
      take,
      skip: q.skip ?? 0,
    });
  });
}
