import { handle, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { getCategoryPricing } from "@/lib/settings";
import { activeCategories } from "@/lib/subscription";

/** Tarifs en vigueur + catégories actives du propriétaire (une catégorie est active dès qu'elle contient une offre). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const [pricing, active] = await Promise.all([getCategoryPricing(), activeCategories(user.id)]);
    return ok({ pricing, active });
  });
}
