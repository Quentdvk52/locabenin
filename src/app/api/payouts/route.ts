import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { requestPayout, completePayout } from "@/lib/payments";
import { walletBalance, walletStatement } from "@/lib/ledger";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";

const requestSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH"]),
  destination: z.string().regex(/^\+?[0-9]{8,15}$/, "Numéro Mobile Money invalide."),
  role: z.enum(["OWNER", "AGENT"]),
});

const otpSchema = z.object({ payoutId: z.string() });
const otpVerifySchema = z.object({ payoutId: z.string(), code: z.string().regex(/^[0-9]{6}$/) });

/**
 * Retraits Mobile Money : KYC obligatoire → OTP de confirmation →
 * approbation admin au-delà du seuil paramétrable → paiement simulé (mock).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, requestSchema);
    if (user.kycStatus !== "VERIFIED") {
      throw new ApiError(403, "Vérification d'identité (KYC) requise avant tout retrait.");
    }
    const payout = await requestPayout({ id: user.id, role: body.role }, body.amount, body.method, body.destination);
    return ok({ payoutId: payout.id, status: payout.status, step: "OTP" });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const [ownerBalance, agentBalance, payouts, settings, ownerStatement, agentStatement] = await Promise.all([
      walletBalance("OWNER", user.id),
      walletBalance("AGENT", user.id),
      db.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      getSettings(),
      walletStatement("OWNER", user.id, 50),
      walletStatement("AGENT", user.id, 50),
    ]);
    return ok({ ownerBalance, agentBalance, payouts, settings: { min: settings.payoutMinAmount, autoThreshold: settings.payoutAutoApprovalThreshold }, statements: { OWNER: ownerStatement, AGENT: agentStatement } });
  });
}

/** Étape OTP du retrait : envoi puis vérification. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "send") {
      const { payoutId } = await parseBody(req, otpSchema);
      const payout = await db.payout.findFirst({ where: { id: payoutId, userId: user.id, status: "OTP_PENDING" } });
      if (!payout) throw new ApiError(404, "Demande de retrait introuvable.");
      const otp = await import("@/lib/auth").then((m) => m.createOtp(user.phone ?? payout.destination, "PAYOUT"));
      return ok({ sent: true, devCode: otp.devCode });
    }

    if (action === "verify") {
      const { payoutId, code } = await parseBody(req, otpVerifySchema);
      const payout = await db.payout.findFirst({ where: { id: payoutId, userId: user.id, status: "OTP_PENDING" } });
      if (!payout) throw new ApiError(404, "Demande de retrait introuvable.");
      const valid = await import("@/lib/auth").then((m) => m.verifyOtp(user.phone ?? payout.destination, code, "PAYOUT"));
      if (!valid) throw new ApiError(401, "Code OTP invalide.");
      const settings = await getSettings();
      // Sous le seuil : traitement automatique. Au-delà : file admin.
      if (payout.amount <= settings.payoutAutoApprovalThreshold) {
        const done = await completePayout(payout.id, `Retrait auto ${payout.method} ${payout.destination}`);
        return ok({ status: done.status, autoProcessed: true });
      }
      const updated = await db.payout.update({ where: { id: payout.id }, data: { status: "REQUESTED", otpVerified: true } });
      return ok({ status: updated.status, autoProcessed: false });
    }
    throw new ApiError(400, "Action inconnue.");
  });
}
