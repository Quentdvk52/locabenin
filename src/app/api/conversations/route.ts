import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification, emitRealtime } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const createSchema = z.object({
  listingId: z.string().optional(),
  recipientId: z.string(),
  message: z.string().min(1).max(2000),
});

/** Démarre (ou retrouve) une conversation et envoie le premier message. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`msg:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Vous envoyez beaucoup de messages. Patientez un peu.");
    }
    const body = await parseBody(req, createSchema);
    if (body.recipientId === user.id) throw new ApiError(400, "Conversation avec soi-même impossible.");

    // Une conversation par (listing, paire d'utilisateurs)
    let conversation = await db.conversation.findFirst({
      where: {
        listingId: body.listingId ?? null,
        participants: { every: { userId: { in: [user.id, body.recipientId] } } },
      },
      include: { participants: true },
    });
    if (conversation && conversation.participants.length !== 2) conversation = null;

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          listingId: body.listingId ?? null,
          participants: { create: [{ userId: user.id }, { userId: body.recipientId }] },
          messages: { create: { senderId: user.id, body: body.message } },
          lastMessageAt: new Date(),
        },
        include: { participants: true },
      });
    } else {
      await db.message.create({ data: { conversationId: conversation.id, senderId: user.id, body: body.message } });
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    }

    await sendNotification({
      userId: body.recipientId, type: "MESSAGE",
      title: "Nouveau message",
      body: body.message.slice(0, 80),
      linkHash: `#/messagerie?c=${conversation.id}`,
    });
    await emitRealtime(`user:${body.recipientId}`, "message", { conversationId: conversation.id, from: user.fullName, body: body.message });
    return ok({ conversationId: conversation.id });
  });
}

/** Conversations de l'utilisateur avec dernier message et non-lus. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const participations = await db.conversationParticipant.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            listing: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: "desc" } },
    });
    return ok(participations.map((p) => {
      const others = p.conversation.participants.filter((x) => x.userId !== user.id);
      return {
        id: p.conversation.id,
        listing: p.conversation.listing,
        other: others[0]?.user ?? null,
        lastMessage: p.conversation.messages[0] ?? null,
        lastMessageAt: p.conversation.lastMessageAt,
        unread: p.lastReadAt && p.conversation.messages[0] && p.conversation.messages[0].createdAt > p.lastReadAt && p.conversation.messages[0].senderId !== user.id ? 1 : 0,
      };
    }));
  });
}
