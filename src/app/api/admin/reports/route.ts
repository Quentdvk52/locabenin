// ============================================================
// LocaBénin — /api/admin/reports (signalements)
// GET   ?status= → signalements (reporter + offre liée)
// PATCH { id, action: "resolve"|"dismiss", resolution?, suspendListing? }
//   resolve → RESOLVED + resolution (+ suspension optionnelle de
//             l'offre signalée dans la même action)
//   dismiss → DISMISSED
// ============================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, parseQuery, requireAdmin, ApiError, getClientMeta } from "@/lib/api";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { auditAction, adminRateLimited } from "../helpers";

const querySchema = z.object({
  status: z.string().trim().max(20).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["resolve", "dismiss"]),
  resolution: z.string().trim().max(500).optional(),
  suspendListing: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = parseQuery(req, querySchema);

    const where = q.status && q.status !== "ALL" ? { status: q.status } : {};
    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: q.take ?? 100,
        include: {
          reporter: { select: { id: true, fullName: true, phone: true } },
          listing: {
            select: { id: true, title: true, reference: true, status: true, ownerId: true, owner: { select: { fullName: true } } },
          },
        },
      }),
      db.report.count({ where }),
    ]);

    return ok({
      items: reports.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolution: r.resolution,
        createdAt: r.createdAt,
        reporter: r.reporter,
        listing: r.listing
          ? {
              id: r.listing.id,
              title: r.listing.title,
              reference: r.listing.reference,
              status: r.listing.status,
              ownerName: r.listing.owner?.fullName ?? null,
            }
          : null,
      })),
      total,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const actor = await requireAdmin();
    if (adminRateLimited("reports", actor.id)) throw new ApiError(429, "Trop d'actions. Patientez un instant.");
    const body = await parseBody(req, patchSchema);
    const meta = getClientMeta(req);

    const report = await db.report.findUnique({
      where: { id: body.id },
      include: { listing: { select: { id: true, title: true, ownerId: true, status: true } } },
    });
    if (!report) throw new ApiError(404, "Signalement introuvable.");
    if (!["OPEN", "REVIEWING"].includes(report.status)) {
      throw new ApiError(400, `Ce signalement est déjà traité (statut : ${report.status}).`);
    }

    const resolutionText =
      body.resolution?.trim() ??
      (body.action === "resolve" ? "Signalement examiné et confirmé par l'administration." : "Signalement examiné, non fondé.");

    if (body.action === "resolve" && body.suspendListing && report.listing) {
      if (["PUBLISHED", "RESERVED", "PENDING_REVIEW"].includes(report.listing.status)) {
        await db.listing.update({
          where: { id: report.listing.id },
          data: {
            status: "SUSPENDED_OWNER",
            isFeatured: false,
            moderationNote: `Suspendue à la suite d'un signalement : ${resolutionText}`,
          },
        });
        await sendNotification({
          userId: report.listing.ownerId,
          type: "SYSTEM",
          title: "Offre suspendue après signalement",
          body: `« ${report.listing.title} » a été suspendue à la suite d'un signalement examiné par l'administration. ${resolutionText}`,
          linkHash: "#/proprietaire/biens",
        });
      }
    }

    const updated = await db.report.update({
      where: { id: report.id },
      data: {
        status: body.action === "resolve" ? "RESOLVED" : "DISMISSED",
        resolution: resolutionText,
        reviewedById: actor.id,
      },
    });

    await auditAction({
      actorId: actor.id,
      action: body.action === "resolve" ? "REPORT_RESOLVE" : "REPORT_DISMISS",
      entityType: "Report",
      entityId: report.id,
      meta: {
        reason: report.reason,
        listingId: report.listingId,
        suspendListing: Boolean(body.suspendListing && report.listing),
        resolution: resolutionText,
      },
      ip: meta.ip,
    });

    return ok({ id: updated.id, status: updated.status });
  });
}
