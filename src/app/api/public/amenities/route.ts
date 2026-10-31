import { handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  return handle(async () => {
    return ok(await db.amenity.findMany({ orderBy: [{ group: "asc" }, { label: "asc" }] }));
  });
}
