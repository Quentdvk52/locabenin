import { handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

/** Référentiel géographique du Bénin (départements → communes → quartiers). */
export async function GET() {
  return handle(async () => {
    const departments = await db.department.findMany({
      orderBy: { name: "asc" },
      include: {
        communes: {
          orderBy: { name: "asc" },
          include: { areas: { orderBy: { name: "asc" } } },
        },
      },
    });
    return ok(departments);
  });
}
