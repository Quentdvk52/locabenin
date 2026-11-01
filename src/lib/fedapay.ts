// ============================================================
// LocaBénin — Client FedaPay (module PUR, sans dépendance base de
// données ni "server-only" : testable directement par bun test).
//
// Contrat vérifié auprès des sources officielles FedaPay :
//  • Docs API (docs.fedapay.com) :
//    - POST {base}/v1/transactions  → {"v1/transaction": {...}}
//      corps : { description, amount (entier), currency:{iso:"XOF"},
//                callback_url, customer{email, firstname, lastname,
//                phone_number{number, country}}, custom_metadata }
//    - POST {base}/v1/transactions/{id}/token → lien de paiement
//    - Base : https://api.fedapay.com (live) /
//             https://sandbox-api.fedapay.com (sandbox)
//    - Statuts : pending, approved, declined, canceled, refunded,
//      transferred, expired.
//  • SDK officiel fedapay-node v1.2.5 (src/Webhook.ts) :
//    en-tête X-FEDAPAY-SIGNATURE au format "t=<unix>,s=<hex>[,s=<hex>…]",
//    signature = HMAC-SHA256(secret, "<t>.<corps brut>") en hexadécimal,
//    comparaison à constante de temps, tolérance 300 secondes.
// ============================================================

import crypto from "crypto";

// ---------- Configuration (variables d'environnement) ----------

export type FedapayEnvironment = "sandbox" | "live";

export interface FedapayConfig {
  secretKey: string;
  environment: FedapayEnvironment;
  webhookSecret: string;
}

export function readFedapayConfig(): FedapayConfig {
  return {
    secretKey: process.env.FEDAPAY_SECRET_KEY ?? "",
    environment: process.env.FEDAPAY_ENVIRONMENT === "live" ? "live" : "sandbox",
    webhookSecret: process.env.FEDAPAY_WEBHOOK_SECRET ?? "",
  };
}

export function fedapayApiBase(environment: FedapayEnvironment): string {
  return environment === "live" ? "https://api.fedapay.com" : "https://sandbox-api.fedapay.com";
}

// ---------- Vérification de signature webhook ----------
// Reproduit EXACTEMENT WebhookSignature du SDK officiel (t + s, HMAC-SHA256,
// plusieurs signatures admises, tolérance anti-rejeu) — sans dépendance npm.

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes (valeur du SDK)

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function computeFedapaySignature(timestamp: number, rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/**
 * Vérifie l'en-tête X-FEDAPAY-SIGNATURE sur le corps BRUT de la requête.
 * Retourne false (jamais d'exception) : la route décide de la réponse 401.
 */
export function verifyFedapaySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!header || header.length === 0 || secret.length === 0) return false;

  // Parse "t=1234567890,s=abcdef,s=fedcba" (le SDK accepte plusieurs s=).
  let timestamp = -1;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") timestamp = parseInt(value, 10);
    else if (key === "s") signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || timestamp < 0 || signatures.length === 0) return false;

  const expected = computeFedapaySignature(timestamp, rawBody, secret);
  if (!signatures.some((s) => timingSafeEqualHex(s, expected))) return false;

  // Anti-rejeu : signature trop ancienne refusée (comme le SDK ; le cadre
  // symétrique rejette aussi un horodatage dans le futur).
  const age = Math.floor(Date.now() / 1000) - timestamp;
  if (Math.abs(age) > toleranceSeconds) return false;
  return true;
}

// ---------- Mapping des événements FedaPay → pipeline LocaBénin ----------

export type InternalEventType = "payment.succeeded" | "payment.failed" | "payment.refunded";

/** Événement FedaPay (réduction du JSON reçu : {id, name, entity}). */
export interface FedapayEventShape {
  id?: string | number;
  name?: string;
  created_at?: string;
  entity?: {
    id?: string | number;
    status?: string;
    reference?: string;
    updated_at?: string;
    created_at?: string;
    amount?: number;
    custom_metadata?: Record<string, unknown> | string | null;
  };
}

export interface ParsedFedapayEvent {
  eventId: string;
  type: InternalEventType;
  paymentReference: string;
  providerRef: string;
  occurredAt: string;
}

/** Statuts FedaPay qui terminent le paiement côté client. */
const FAILED_STATUSES = new Set(["declined", "canceled", "expired"]);

/** Construit un eventId déterministe même si FedaPay n'en fournit pas. */
function fedapayEventId(evt: FedapayEventShape, entityRef: string): string {
  if (evt.id !== undefined && evt.id !== null && String(evt.id).length > 0) return `fedapay-${evt.id}`;
  const entity = evt.entity?.id ?? "sans-entite";
  return `fedapay-${evt.name ?? "inconnu"}-${entity}-${entityRef}`;
}

function readCustomMetadataReference(cm: Record<string, unknown> | string | null | undefined): string | null {
  if (!cm) return null;
  try {
    const obj = typeof cm === "string" ? (JSON.parse(cm) as Record<string, unknown>) : cm;
    const ref = obj["reference"];
    return typeof ref === "string" && ref.startsWith("PAY-") ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Traduit un webhook FedaPay en événement interne du pipeline
 * (processWebhookEvent). Retourne null si l'événement ne concerne pas un
 * paiement à traiter (transaction.created / transferred / updated…) ou si la
 * référence LocaBénin est introuvable — la route répond alors 200 sans effet.
 */
export function parseFedapayEvent(payload: unknown): ParsedFedapayEvent | null {
  const evt = (payload ?? {}) as FedapayEventShape;
  const name = typeof evt.name === "string" ? evt.name : "";
  const entity = evt.entity ?? {};

  let type: InternalEventType | null = null;
  switch (name) {
    case "transaction.approved":
    case "transaction.transferred": // transfert marchand : le client a payé puis les fonds arrivés
      type = "payment.succeeded";
      break;
    case "transaction.declined":
    case "transaction.canceled":
    case "transaction.expired":
      type = "payment.failed";
      break;
    case "transaction.refunded":
      type = "payment.refunded";
      break;
    default:
      return null; // transaction.created, transaction.updated, customer.*… : sans effet
  }

  const reference =
    readCustomMetadataReference(entity.custom_metadata) ??
    (typeof entity.reference === "string" && entity.reference.startsWith("PAY-") ? entity.reference : null);
  if (!reference) return null; // ne pas traiter une transaction non née chez nous

  const occurredAt = entity.updated_at ?? entity.created_at ?? evt.created_at ?? new Date().toISOString();
  return {
    eventId: fedapayEventId(evt, reference),
    type,
    paymentReference: reference,
    providerRef: entity.id !== undefined && entity.id !== null ? String(entity.id) : "",
    occurredAt,
  };
}
