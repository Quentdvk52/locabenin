import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, parseBody, fail, getClientMeta } from "@/lib/api";
import { createOtp } from "@/lib/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const schema = z.object({
  phone: z.string().regex(/^\+?[0-9]{8,15}$/, "Numéro de téléphone invalide (ex. +2290197000000)."),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { phone } = await parseBody(req, schema);
    const meta = getClientMeta(req);
    // Rate limit par IP + destination (anti-abus OTP)
    if (!rateLimit(`otp:${meta.ip}`, RATE_LIMITS.otpSend.limit, RATE_LIMITS.otpSend.windowMs) ||
        !rateLimit(`otp:dest:${phone}`, RATE_LIMITS.otpSend.limit, RATE_LIMITS.otpSend.windowMs)) {
      return fail(429, "Trop de demandes. Patientez quelques minutes avant de redemander un code.");
    }
    const result = await createOtp(phone, "AUTH");
    // Sandbox : le code est renvoyé pour permettre le test (le vrai canal SMS
    // sera branché via NotificationChannel en production).
    return ok({ destination: result.destination, devCode: result.devCode, ttlMin: result.ttlMin });
  });
}
