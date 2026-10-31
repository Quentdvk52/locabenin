import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/api";
import { subscriptionSummary, ensureBillingCycle } from "@/lib/subscription";

/** Résumé temps réel de l'abonnement propriétaire (montant calculé live). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await ensureBillingCycle(user.id); // évaluation du cycle courant (rappels, masquage)
    return ok(await subscriptionSummary(user.id));
  });
}
