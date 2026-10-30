import { handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

/** Villes populaires : communes avec offres publiées, comptées. */
export async function GET() {
  return handle(async () => {
    const listings = await db.listing.findMany({
      where: { status: "PUBLISHED", deletedAt: null, area: { isNot: null } },
      include: { area: { include: { commune: true } } },
    });
    const counts = new Map<string, { name: string; count: number }>();
    for (const l of listings) {
      const commune = l.area?.commune;
      if (!commune) continue;
      const entry = counts.get(commune.id) ?? { name: commune.name, count: 0 };
      entry.count += 1;
      counts.set(commune.id, entry);
    }
    const cities = [...counts.entries()]
      .map(([id, v]) => ({ id, name: v.name, slug: v.name.toLowerCase().replace(/\s+/g, "-"), count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return ok(cities);
  });
}
