import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const schema = z.object({ listingId: z.string().min(5) });

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { listingId } = await parseBody(req, schema);
    const existing = await db.favorite.findUnique({
      where: { userId_listingId: { userId: user.id, listingId } },
    });
    if (existing) {
      await db.favorite.delete({ where: { userId_listingId: { userId: user.id, listingId } } });
      await db.listing.update({ where: { id: listingId }, data: { favoritesCount: { decrement: 1 } } }).catch(() => {});
      return ok({ favorite: false });
    }
    await db.favorite.create({ data: { userId: user.id, listingId } });
    await db.listing.update({ where: { id: listingId }, data: { favoritesCount: { increment: 1 } } }).catch(() => {});
    return ok({ favorite: true });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const favorites = await db.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          include: {
            area: { include: { commune: true } },
            media: { orderBy: { position: "asc" }, take: 4 },
          },
        },
      },
    });
    return ok(favorites.map((f) => f.listing));
  });
}
