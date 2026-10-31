import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification, channels } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const createSchema = z.object({
  scope: z.enum(["ALL", "LISTING"]),
  scopeId: z.string().optional(),
  title: z.string().min(3).max(120),
  body: z.string().min(3).max(2000),
  channels: z.array(z.enum(["IN_APP", "SMS", "WHATSAPP"])).min(1).default(["IN_APP"]),
});

/**
 * Annonces groupées du propriétaire (à tous ses locataires ou par bien).
 * Canaux : in-app toujours ; SMS/WhatsApp via NotificationChannel (logs en
 * sandbox, agrégateurs en production).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    if (!rateLimit(`announce:${user.id}`, 10, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop d'annonces envoyées, patientez un peu.");
    }
    const data = await parseBody(req, createSchema);

    const leases = await db.lease.findMany({
      where: {
        ownerId: user.id,
        status: { in: ["ACTIVE", "NOTICE_GIVEN"] },
        ...(data.scope === "LISTING" && data.scopeId ? { listingId: data.scopeId } : {}),
      },
      select: { tenantId: true },
    });
    const tenantIds = [...new Set(leases.map((l) => l.tenantId))];
    const extraChannels = [
      ...(data.channels.includes("SMS") ? [channels.sms] : []),
      ...(data.channels.includes("WHATSAPP") ? [channels.whatsapp] : []),
    ];
    for (const tenantId of tenantIds) {
      await sendNotification(
        { userId: tenantId, type: "SYSTEM", title: data.title, body: data.body, linkHash: "#/locataire/bail" },
        extraChannels,
      );
    }
    const announcement = await db.announcement.create({
      data: {
        ownerId: user.id, scope: data.scope, scopeId: data.scopeId ?? null,
        title: data.title, body: data.body, channelsJson: JSON.stringify(data.channels),
        recipientCount: tenantIds.length,
      },
    });
    return ok({ announcement, recipientCount: tenantIds.length });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!user.roles.includes("OWNER") && !user.isAdmin) throw new ApiError(403, "Réservé aux propriétaires.");
    const announcements = await db.announcement.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { },
    });
    return ok(announcements.map((a) => ({ ...a, channels: JSON.parse(a.channelsJson) as string[] })));
  });
}
