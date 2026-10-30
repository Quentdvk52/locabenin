import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const createSchema = z.object({
  leaseId: z.string(),
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(2000),
  photos: z.array(z.string()).max(4).default([]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

/** Tickets de réparation : création par le locataire. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`ticket:${user.id}`, RATE_LIMITS.message.limit, RATE_LIMITS.message.windowMs)) {
      throw new ApiError(429, "Trop de tickets créés, patientez un peu.");
    }
    const body = await parseBody(req, createSchema);
    const lease = await db.lease.findUnique({ where: { id: body.leaseId }, include: { listing: true } });
    if (!lease || lease.tenantId !== user.id) return fail(404, "Bail introuvable.");
    const ticket = await db.maintenanceTicket.create({
      data: {
        leaseId: lease.id, tenantId: user.id, ownerId: lease.ownerId, listingId: lease.listingId,
        title: body.title, description: body.description, photosJson: JSON.stringify(body.photos), priority: body.priority,
      },
    });
    await sendNotification({
      userId: lease.ownerId, type: "TICKET", title: "Nouveau ticket de réparation",
      body: `${body.title} — ${lease.listing.title}`,
      linkHash: "#/proprietaire/reparations",
    });
    return ok(ticket);
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const isOwner = user.activeRole === "OWNER" || user.isAdmin;
    const tickets = await db.maintenanceTicket.findMany({
      where: isOwner && !user.isAdmin ? { ownerId: user.id } : user.isAdmin ? {} : { tenantId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        listing: { select: { title: true } },
        tenant: { select: { fullName: true, phone: true } },
        updates: { orderBy: { createdAt: "asc" } },
      },
    });
    return ok(tickets.map((t) => ({ ...t, photos: JSON.parse(t.photosJson) as string[] })));
  });
}

const updateSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  body: z.string().max(1000).optional(),
});

/** Suivi de ticket : changement de statut (propriétaire) + messages des deux parties. */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { id, status, body } = await parseBody(req, updateSchema);
    const ticket = await db.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) return fail(404, "Ticket introuvable.");
    const isOwner = ticket.ownerId === user.id;
    const isTenant = ticket.tenantId === user.id;
    if (!isOwner && !isTenant) throw new ApiError(403, "Accès refusé.");
    if (body || status) {
      await db.ticketUpdate.create({
        data: { ticketId: id, authorId: user.id, body: body ?? "", statusAfter: status },
      });
    }
    if (status && isOwner) {
      await db.maintenanceTicket.update({
        where: { id },
        data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
      });
      await sendNotification({
        userId: ticket.tenantId, type: "TICKET", title: "Ticket mis à jour",
        body: `${ticket.title} — statut : ${status === "RESOLVED" ? "résolu" : status === "IN_PROGRESS" ? "en cours" : status === "CLOSED" ? "clôturé" : "réouvert"}.`,
        linkHash: "#/locataire/reparations",
      });
    }
    return ok({ updated: true });
  });
}
