import { handle, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { ensureBillingCycle } from "@/lib/subscription";

/** Factures d'abonnement du propriétaire (avec évaluation du cycle courant). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    await ensureBillingCycle(user.id);
    const invoices = await db.subscriptionInvoice.findMany({
      where: { ownerId: user.id },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    return ok(invoices);
  });
}
