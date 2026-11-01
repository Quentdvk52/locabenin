import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider, processWebhookEvent } from "@/lib/payments";
import { parseFedapayEvent } from "@/lib/fedapay";

/**
 * Webhook de l'agrégateur de paiement (FedaPay / mock).
 * Sécurité : signature HMAC vérifiée sur le corps BRUT (en-tête dépendant du
 * provider : X-FEDAPAY-SIGNATURE pour FedaPay, x-webhook-signature pour le
 * simulateur) ; idempotence stricte via table PaymentEvent (eventId unique) ;
 * rejeu sans double effet métier.
 *
 * Deux formats acceptés :
 *  • FedaPay (JSON natif) : { id, name: "transaction.approved"|…, entity:{id,
 *    status, reference, custom_metadata:{reference: "PAY-…"}, …} }
 *    → traduit en événement interne ; les événements sans effet (created,
 *    updated…) et les transactions inconnues répondent 200 pour éviter la
 *    désactivation automatique du endpoint après 10 échecs (doc FedaPay).
 *  • Simulateur (format interne) : { eventId, type, paymentReference,
 *    providerRef, occurredAt }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await req.text();
  const signature =
    provider === "fedapay"
      ? req.headers.get("x-fedapay-signature")
      : req.headers.get("x-webhook-signature") ?? req.headers.get("x-fp-signature");

  // Réponse 200 rapide pour les doublons connus : l'agrégateur ne doit pas
  // boucler indéfiniment sur un event déjà traité (format interne uniquement —
  // pour FedaPay la déduplication a lieu dans processWebhookEvent).
  if (provider !== "fedapay") {
    try {
      const parsed = JSON.parse(raw) as { eventId?: string };
      if (parsed.eventId) {
        const seen = await db.paymentEvent.findUnique({ where: { eventId: parsed.eventId } });
        if (seen?.processedAt) return NextResponse.json({ received: true, duplicate: true });
      }
    } catch {
      return NextResponse.json({ received: false, error: "JSON invalide" }, { status: 400 });
    }
  }

  const paymentProvider = getPaymentProvider();
  if (paymentProvider.name !== provider || !paymentProvider.verifyWebhook(raw, signature)) {
    // Signature invalide : journalisé, réponse 401 sans détail interne.
    console.warn(`[WEBHOOK:${provider}] signature invalide refusée`);
    return NextResponse.json({ received: false }, { status: 401 });
  }

  try {
    if (provider === "fedapay") {
      const internal = parseFedapayEvent(JSON.parse(raw));
      if (!internal) {
        // Événement sans effet métier (transaction.created, customer.*, …)
        // ou transaction non émise par LocaBénin : accusé de réception positif.
        return NextResponse.json({ received: true, ignored: true });
      }
      const result = await processWebhookEvent({ provider, ...internal });
      return NextResponse.json({ received: true, duplicate: result.duplicate });
    }

    const evt = JSON.parse(raw) as {
      eventId: string; type: "payment.succeeded" | "payment.failed" | "payment.refunded";
      paymentReference: string; providerRef: string; occurredAt: string;
    };
    if (!evt.eventId || !evt.type || !evt.paymentReference) {
      return NextResponse.json({ received: false, error: "Champs manquants" }, { status: 400 });
    }
    const result = await processWebhookEvent({ provider, ...evt });
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (e) {
    console.error(`[WEBHOOK:${provider}] erreur de traitement`, e);
    // 500 → l'agrégateur rejouera plus tard (retard géré par l'état cible).
    return NextResponse.json({ received: false, retry: true }, { status: 500 });
  }
}
