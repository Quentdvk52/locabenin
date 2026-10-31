import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification, emitRealtime } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const sendSchema = z.object({ body: z.string().min(1).max(2000), attachmentUrl: z.string().optional() });

/** Messages d'une conversation (les parties uniquement — anti-IDOR strict). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const participation = await db.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    if (!participation) throw new ApiError(403, "Conversation inaccessible.");
    const messages = await db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
    await db.conversationParticipant.update({ where: { conversationId_userId: { conversationId: id, userId: user.id } }, data: { lastReadAt: new Date() } });
    return ok(messages);
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`msg:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Vous envoyez beaucoup de messages. Patientez un peu.");
    }
    const { id } = await ctx.params;
    const data = await parseBody(req, sendSchema);
    const participation = await db.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    if (!participation) return fail(403, "Conversation inaccessible.");
    const message = await db.message.create({
      data: { conversationId: id, senderId: user.id, body: data.body, attachmentUrl: data.attachmentUrl },
      include: { sender: { select: { id: true, fullName: true, avatarUrl: true } } },
    });
    await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    const others = await db.conversationParticipant.findMany({ where: { conversationId: id, userId: { not: user.id } } });
    for (const other of others) {
      await sendNotification({ userId: other.userId, type: "MESSAGE", title: "Nouveau message", body: data.body.slice(0, 80), linkHash: `#/messagerie?c=${id}` });
      await emitRealtime(`user:${other.userId}`, "message", { conversationId: id, from: user.fullName, body: data.body });
    }
    await emitRealtime(`conv:${id}`, "message", message);
    return ok(message);
  });
}
