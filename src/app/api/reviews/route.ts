import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";

const createSchema = z.object({
  leaseId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

/** Avis après location (le locataire note le logement, une fois par bail). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, createSchema);
    const lease = await db.lease.findUnique({ where: { id: body.leaseId } });
    if (!lease || lease.tenantId !== user.id) return fail(404, "Bail introuvable.");
    const existing = await db.review.findUnique({ where: { leaseId_authorId: { leaseId: lease.id, authorId: user.id } } });
    if (existing) throw new ApiError(409, "Vous avez déjà évalué cette location.");
    const review = await db.review.create({
      data: { leaseId: lease.id, listingId: lease.listingId, authorId: user.id, rating: body.rating, comment: body.comment },
    });
    return ok(review);
  });
}
