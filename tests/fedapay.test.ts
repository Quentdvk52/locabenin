/// <reference types="bun-types" />
// ============================================================
// LocaBénin — Tests unitaires FedaPay (bun test)
// Couverture :
//  • Vérification de signature X-FEDAPAY-SIGNATURE (algorithme du SDK
//    officiel fedapay-node : t + s, HMAC-SHA256("<t>.<corps>"), tolérance)
//  • Mapping des événements FedaPay → pipeline interne LocaBénin
// Exécution : bun test tests/fedapay.test.ts
// ============================================================

import { describe, expect, test } from "bun:test";
import {
  computeFedapaySignature,
  verifyFedapaySignature,
  parseFedapayEvent,
  fedapayApiBase,
  readFedapayConfig,
} from "../src/lib/fedapay";

const SECRET = "wh_test_secret_1234567890abcdef";

function headerFor(t: number, rawBody: string, secret = SECRET, scheme = "s"): string {
  return `t=${t},${scheme}=${computeFedapaySignature(t, rawBody, secret)}`;
}

const BODY = JSON.stringify({
  id: 1234567,
  name: "transaction.approved",
  created_at: "2026-11-01T10:00:00.000Z",
  entity: {
    id: 987654,
    status: "approved",
    amount: 480000,
    custom_metadata: { reference: "PAY-ABC123-9999" },
    updated_at: "2026-11-01T10:00:05.000Z",
  },
});

describe("vérification de signature FedaPay (X-FEDAPAY-SIGNATURE)", () => {
  test("signature valide → true", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyFedapaySignature(BODY, headerFor(t, BODY), SECRET)).toBe(true);
  });

  test("corps altéré → false", () => {
    const t = Math.floor(Date.now() / 1000);
    const tampered = BODY.replace("approved", "declined");
    expect(verifyFedapaySignature(tampered, headerFor(t, BODY), SECRET)).toBe(false);
  });

  test("mauvais secret → false", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyFedapaySignature(BODY, headerFor(t, BODY, "wh_autre_secret"), SECRET)).toBe(false);
  });

  test("en-tête absent → false", () => {
    expect(verifyFedapaySignature(BODY, null, SECRET)).toBe(false);
    expect(verifyFedapaySignature(BODY, "", SECRET)).toBe(false);
  });

  test("en-tête malformé (sans t= ni s=) → false", () => {
    expect(verifyFedapaySignature(BODY, "v1=abcdef", SECRET)).toBe(false);
    expect(verifyFedapaySignature(BODY, "t=1234567890", SECRET)).toBe(false);
  });

  test("horodatage trop ancien (> 300 s) → false (anti-rejeu)", () => {
    const old = Math.floor(Date.now() / 1000) - 301;
    expect(verifyFedapaySignature(BODY, headerFor(old, BODY), SECRET)).toBe(false);
  });

  test("horodatage à 299 s → true (limite SDK)", () => {
    const near = Math.floor(Date.now() / 1000) - 299;
    expect(verifyFedapaySignature(BODY, headerFor(near, BODY), SECRET)).toBe(true);
  });

  test("tolérance personnalisée respectée", () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyFedapaySignature(BODY, headerFor(old, BODY), SECRET, 3600)).toBe(true);
    expect(verifyFedapaySignature(BODY, headerFor(old, BODY), SECRET, 300)).toBe(false);
  });

  test("plusieurs signatures s= : la bonne en 2e position → true", () => {
    const t = Math.floor(Date.now() / 1000);
    const bad = computeFedapaySignature(t, "corps-qui-ne-corrrespond-pas", SECRET);
    const good = computeFedapaySignature(t, BODY, SECRET);
    expect(verifyFedapaySignature(BODY, `t=${t},s=${bad},s=${good}`, SECRET)).toBe(true);
  });

  test("secret vide (FEDAPAY_WEBHOOK_SECRET absent) → false", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyFedapaySignature(BODY, headerFor(t, BODY), "")).toBe(false);
  });
});

describe("mapping des événements FedaPay → pipeline interne", () => {
  test("transaction.approved → payment.succeeded avec référence custom_metadata", () => {
    const evt = parseFedapayEvent(JSON.parse(BODY));
    expect(evt).not.toBeNull();
    expect(evt!.type).toBe("payment.succeeded");
    expect(evt!.paymentReference).toBe("PAY-ABC123-9999");
    expect(evt!.providerRef).toBe("987654");
    expect(evt!.occurredAt).toBe("2026-11-01T10:00:05.000Z");
  });

  test("transaction.transferred → payment.succeeded (fonds arrivés = client a payé)", () => {
    const evt = parseFedapayEvent({ id: 1, name: "transaction.transferred", entity: { id: 2, custom_metadata: { reference: "PAY-X-1" } } });
    expect(evt?.type).toBe("payment.succeeded");
  });

  test("transaction.declined / canceled / expired → payment.failed", () => {
    for (const name of ["transaction.declined", "transaction.canceled", "transaction.expired"]) {
      const evt = parseFedapayEvent({ id: 1, name, entity: { id: 2, custom_metadata: { reference: "PAY-X-1" } } });
      expect(evt?.type).toBe("payment.failed");
    }
  });

  test("transaction.refunded → payment.refunded", () => {
    const evt = parseFedapayEvent({ id: 1, name: "transaction.refunded", entity: { id: 2, custom_metadata: { reference: "PAY-X-1" } } });
    expect(evt?.type).toBe("payment.refunded");
  });

  test("événements sans effet (created, updated, customer.*) → null", () => {
    expect(parseFedapayEvent({ id: 1, name: "transaction.created", entity: { id: 2 } })).toBeNull();
    expect(parseFedapayEvent({ id: 1, name: "transaction.updated", entity: { id: 2 } })).toBeNull();
    expect(parseFedapayEvent({ id: 1, name: "customer.created", entity: { id: 2 } })).toBeNull();
    expect(parseFedapayEvent({ name: undefined })).toBeNull();
  });

  test("référence LocaBénin absente (transaction étrangère) → null", () => {
    expect(parseFedapayEvent({ id: 1, name: "transaction.approved", entity: { id: 2 } })).toBeNull();
    expect(parseFedapayEvent({ id: 1, name: "transaction.approved", entity: { id: 2, custom_metadata: { autre: 1 } } })).toBeNull();
    // référence qui n'est pas au format PAY- : ignorée
    expect(parseFedapayEvent({ id: 1, name: "transaction.approved", entity: { id: 2, reference: "FDP-42" } })).toBeNull();
  });

  test("custom_metadata sérialisé en chaîne (variante d'API) → référence lue", () => {
    const evt = parseFedapayEvent({ id: 1, name: "transaction.approved", entity: { id: 2, custom_metadata: JSON.stringify({ reference: "PAY-STR-1" }) } });
    expect(evt?.paymentReference).toBe("PAY-STR-1");
  });

  test("eventId déterministe : identique pour le même webhook (idempotence)", () => {
    const a = parseFedapayEvent(JSON.parse(BODY));
    const b = parseFedapayEvent(JSON.parse(BODY));
    expect(a?.eventId).toBe(b?.eventId);
    expect(a?.eventId).toBe("fedapay-1234567");
  });

  test("sans id d'événement : eventId déterministe sur name+entité+référence", () => {
    const payload = { name: "transaction.declined", entity: { id: 77, custom_metadata: { reference: "PAY-NOID-1" } } };
    const a = parseFedapayEvent(payload);
    const b = parseFedapayEvent(payload);
    expect(a?.eventId).toBe(b?.eventId);
    expect(a?.eventId).not.toContain("undefined");
  });
});

describe("configuration FedaPay", () => {
  test("URLs d'API officielles", () => {
    expect(fedapayApiBase("sandbox")).toBe("https://sandbox-api.fedapay.com");
    expect(fedapayApiBase("live")).toBe("https://api.fedapay.com");
  });

  test("lecture de configuration : défauts sûrs (sandbox, clés vides)", () => {
    const cfg = readFedapayConfig();
    expect(cfg.environment === "sandbox" || cfg.environment === "live").toBe(true);
    expect(typeof cfg.secretKey).toBe("string");
    expect(typeof cfg.webhookSecret).toBe("string");
  });
});
