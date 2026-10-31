import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";

const schema = z.object({
  listingId: z.string().optional(),
  reason: z.enum(["SCAM", "FAKE", "INAPPROPRIATE", "DUPLICATE", "OTHER"]),
  details: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`report:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de signalements envoyés. Patientez un peu.");
    }
    const data = await parseBody(req, schema);
    await db.report.create({ data: { reporterId: user.id, listingId: data.listingId ?? null, reason: data.reason, details: data.details } });
    // Les admins suivent la file dans le back-office ; notification de confirmation au déclarant.
    await sendNotification({
      userId: user.id, type: "SYSTEM",
      title: "Signalement reçu",
      body: "Merci. Notre équipe de modération examine votre signalement.",
    });
    return ok({ submitted: true });
  });
}
