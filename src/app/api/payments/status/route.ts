import { NextRequest } from "next/server";
import { handle, ok, requireUser, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/** Statut d'un paiement (polling léger depuis le stepper de paiement). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`pstat:${user.id}`, 120, 60_000)) throw new ApiError(429, "Trop de requêtes.");
    const reference = new URL(req.url).searchParams.get("reference");
    if (!reference) return ok(null);
    const payment = await db.payment.findFirst({
      where: { reference, payerId: user.id },
      select: { id: true, reference: true, amount: true, status: true, purpose: true, method: true, confirmedAt: true, breakdownJson: true },
    });
    return ok(payment);
  });
}
