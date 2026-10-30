import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { simulateProviderWebhook } from "@/lib/payments";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const schema = z.object({
  reference: z.string().min(6),
  outcome: z.enum(["succeeded", "failed"]),
});

/**
 * Simulateur Mobile Money (sandbox uniquement, PAYMENT_PROVIDER=mock) :
 * rejoue le comportement de l'agrégateur — la confirmation construit un
 * webhook SIGNÉ qui traverse le VRAI pipeline (signature + idempotence).
 * Quand FedaPay sera branché, cette route reste pour la démo et les tests.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    if (process.env.PAYMENT_PROVIDER !== "mock") {
      throw new ApiError(404, "Simulateur indisponible.");
    }
    if (!rateLimit("mockpay", 60, 60_000)) throw new ApiError(429, "Simulateur saturé, réessayez.");
    const { reference, outcome } = await parseBody(req, schema);
    const result = await simulateProviderWebhook(reference, outcome);
    return ok(result);
  });
}
