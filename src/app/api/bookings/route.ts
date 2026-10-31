import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError, fail } from "@/lib/api";
import { db } from "@/lib/db";
import { bookingTotal } from "@/lib/finance";

const createSchema = z.object({
  listingId: z.string(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  guests: z.number().int().min(1).max(20).default(1),
});

/** Création d'une réservation de meublé (vérification du calendrier serveur). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, createSchema);
    const listing = await db.listing.findUnique({
      where: { id: body.listingId },
      include: { calendarBlocks: true, bookings: { where: { status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } } },
    });
    if (!listing || listing.genre !== "FURNISHED") return fail(404, "Meublé introuvable.");
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const nights = Math.round((end.getTime() - start.getTime()) / 86400_000);
    if (nights <= 0) throw new ApiError(400, "La date de départ doit être postérieure à l'arrivée.");
    if (listing.minStayDays && nights < listing.minStayDays) throw new ApiError(400, `Séjour minimum : ${listing.minStayDays} nuits.`);

    // Conflit calendrier : chevauchement avec réservations ou dates bloquées
    const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && bS < aE;
    for (const b of listing.bookings) {
      if (overlaps(start, end, new Date(b.startDate), new Date(b.endDate))) throw new ApiError(409, "Ces dates sont déjà réservées.");
    }
    for (const blk of listing.calendarBlocks) {
      if (overlaps(start, end, new Date(blk.startDate), new Date(blk.endDate))) throw new ApiError(409, `Dates indisponibles : ${blk.reason ?? "bloquées par le propriétaire"}.`);
    }

    const total = bookingTotal({ nights, dailyPrice: listing.dailyPrice, weeklyPrice: listing.weeklyPrice, monthlyPrice: listing.monthlyPrice });
    if (total <= 0) throw new ApiError(400, "Tarification indisponible pour ces dates.");
    const booking = await db.booking.create({
      data: {
        code: `RES-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
        listingId: listing.id, tenantId: user.id, startDate: start, endDate: end,
        guests: body.guests, nights, totalAmount: total,
      },
    });
    return ok(booking);
  });
}

const listSchema = z.object({ listingId: z.string() });

/** Calendrier de disponibilité d'un meublé (réservations confirmées + blocages). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const listingId = listSchema.parse({ listingId: new URL(req.url).searchParams.get("listingId") ?? "" }).listingId;
    const [bookings, blocks] = await Promise.all([
      db.booking.findMany({ where: { listingId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, endDate: { gte: new Date() } }, select: { startDate: true, endDate: true, status: true } }),
      db.calendarBlock.findMany({ where: { listingId, endDate: { gte: new Date() } }, select: { startDate: true, endDate: true, reason: true } }),
    ]);
    return ok({ bookings, blocks });
  });
}
