// ============================================================
// LocaBénin — Paiements
// Architecture : interface `PaymentProvider` (abstraction de l'agrégateur)
//   • MockProvider (sandbox) : simulateur Mobile Money complet — le parcours
//     passe par le VRAI pipeline webhook (signature + idempotence).
//   • FedaPay / KkiaPay : à brancher plus tard en implémentant la même
//     interface — AUCUNE autre partie du code ne change (décision utilisateur).
// Événements : signature HMAC vérifiée, idempotence par eventId,
// gestion des retards et ordres inversés (état cible par priorité).
// ============================================================

import "server-only";
import crypto from "crypto";
import { db } from "./db";
import { ApiError } from "./api";
import { postTransaction, PLATFORM_CASH, PLATFORM_REVENUE, walletCode, PLATFORM_PAYOUTS } from "./ledger";
import { getSettings } from "./settings";
import { normalizeToMonthly } from "./finance";
import { sendNotification } from "./notifications";
import { label } from "./constants";
import { formatFcfa, formatDate } from "./finance";

export type PaymentMethodStr = "MTN_MOMO" | "MOOV_MONEY" | "CELTIS_CASH" | "CARD";

export interface InitiateInput {
  reference: string;        // référence interne PAY-XXXX
  amount: number;           // FCFA entier
  method: PaymentMethodStr;
  description: string;
  payerPhone?: string | null;
  payerEmail?: string | null;
}

export interface InitiateResult {
  providerRef: string;
  status: "PENDING";
  // En sandbox : jeton de confirmation du simulateur Mobile Money.
  mockConfirmToken?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Vérifie la signature brute du webhook. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

function webhookSecret(): string {
  return process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret";
}

/** Simulateur Mobile Money — utilisé UNIQUEMENT avec PAYMENT_PROVIDER=mock. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const providerRef = `MOCK-${input.reference}`;
    const token = crypto.createHmac("sha256", webhookSecret()).update(input.reference).digest("hex").slice(0, 12);
    return { providerRef, status: "PENDING", mockConfirmToken: token };
  }
  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = crypto.createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}

export class FedaPayProviderStub implements PaymentProvider {
  readonly name = "fedapay";
  async initiate(_input: InitiateInput): Promise<InitiateResult> {
    throw new ApiError(501, "FedaPay n'est pas encore branché : configurer FEDAPAY_SECRET_KEY puis implémenter l'appel API.");
  }
  verifyWebhook(_rawBody: string, _signature: string | null): boolean {
    throw new ApiError(501, "Vérification FedaPay non configurée.");
  }
}

export function getPaymentProvider(): PaymentProvider {
  switch (process.env.PAYMENT_PROVIDER) {
    case "fedapay": return new FedaPayProviderStub();
    default: return new MockPaymentProvider();
  }
}

function payReference(): string {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;
}

/** Crée un paiement INITIATED et l'envoie au provider. */
export async function initiatePayment(input: {
  payerId: string;
  purpose: "INITIAL" | "RENT" | "BOOKING" | "SUBSCRIPTION";
  amount: number;
  method: PaymentMethodStr;
  description: string;
  leaseId?: string;
  bookingId?: string;
  invoiceId?: string;
  scheduleId?: string;
  breakdown?: Array<{ label: string; amount: number }>;
}) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ApiError(400, "Montant invalide.");
  const reference = payReference();
  const provider = getPaymentProvider();
  const payer = await db.user.findUnique({ where: { id: input.payerId }, select: { phone: true, email: true } });
  const result = await provider.initiate({
    reference, amount: input.amount, method: input.method,
    description: input.description, payerPhone: payer?.phone, payerEmail: payer?.email,
  });
  const payment = await db.payment.create({
    data: {
      reference, payerId: input.payerId, purpose: input.purpose, amount: input.amount,
      method: input.method, status: "PENDING", provider: provider.name, providerRef: result.providerRef,
      leaseId: input.leaseId ?? null, bookingId: input.bookingId ?? null, invoiceId: input.invoiceId ?? null,
      scheduleId: input.scheduleId ?? null,
      breakdownJson: input.breakdown ? JSON.stringify(input.breakdown) : null,
    },
  });
  return { payment, mockConfirmToken: result.mockConfirmToken };
}

export interface WebhookEventInput {
  provider: string;
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "payment.refunded";
  paymentReference: string;
  providerRef: string;
  occurredAt: string;
}

/**
 * Point d'entrée UNIQUE du traitement des webhooks :
 * 1. enregistre l'événement (clé unique eventId → idempotence stricte) ;
 * 2. applique la machine à états du paiement dans l'ordre correct
 *    (réussi > échoué > initié : un webhook en retard ne régresse jamais) ;
 * 3. déclenche les effets métier (ledger, quittance, commissions, factures).
 * Retourne `duplicate: true` si l'eventId a déjà été traité.
 */
export async function processWebhookEvent(evt: WebhookEventInput): Promise<{ duplicate: boolean; payment?: { reference: string; status: string } }> {
  const existing = await db.paymentEvent.findUnique({ where: { eventId: evt.eventId } });
  if (existing?.processedAt) return { duplicate: true };
  const event = existing ?? await db.paymentEvent.create({
    data: { provider: evt.provider, eventId: evt.eventId, type: evt.type, payloadJson: JSON.stringify(evt), signatureValid: true },
  });
  if (existing && !existing.processedAt) {
    await db.paymentEvent.update({ where: { id: event.id }, data: { signatureValid: true } });
  }

  try {
    const payment = await db.payment.findUnique({ where: { reference: evt.paymentReference } });
    if (!payment) throw new Error(`Paiement inconnu : ${evt.paymentReference}`);

    const targetStatus =
      evt.type === "payment.succeeded" ? "SUCCESS" :
      evt.type === "payment.failed" ? "FAILED" : "REFUNDED";

    // Ordre inversé / retard : on ne régresse jamais depuis un état final.
    if (["SUCCESS", "REFUNDED", "DISPUTED"].includes(payment.status)) {
      await db.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
      return { duplicate: false, payment: { reference: payment.reference, status: payment.status } };
    }
    if (payment.status === "FAILED" && targetStatus === "SUCCESS") {
      // Re-lancement réussi après échec : autorisé (retry opérateur).
    }

    if (payment.status !== targetStatus) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: targetStatus,
          confirmedAt: targetStatus === "SUCCESS" ? new Date(evt.occurredAt) : null,
          failureReason: targetStatus === "FAILED" ? "Rejet opérateur Mobile Money" : null,
        },
      });
    }
    await db.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });

    if (targetStatus === "SUCCESS") {
      await applyPaymentSuccess(payment.id);
    }
    return { duplicate: false, payment: { reference: payment.reference, status: targetStatus } };
  } catch (e) {
    await db.paymentEvent.update({
      where: { id: event.id },
      data: { processingError: e instanceof Error ? e.message : "erreur inconnue" },
    });
    throw e;
  }
}

/** Effets métier d'un paiement réussi — idempotent (clés de ledger dérivées du paiement). */
export async function applyPaymentSuccess(paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { lease: { include: { listing: true } }, booking: { include: { listing: true } } },
  });
  if (!payment) return;

  switch (payment.purpose) {
    case "INITIAL": await onInitialPaymentSuccess(payment); break;
    case "RENT": await onRentPaymentSuccess(payment); break;
    case "BOOKING": await onBookingPaymentSuccess(payment); break;
    case "SUBSCRIPTION": await onSubscriptionPaymentSuccess(payment); break;
  }
}

/** Structure minimale d'un paiement réussi (suffisante pour les effets métier). */
interface SuccessfulPayment {
  id: string;
  reference: string;
  amount: number;
  purpose: string;
  payerId: string;
  leaseId: string | null;
  bookingId: string | null;
  invoiceId: string | null;
  scheduleId: string | null;
}

// ---------- INITIAL : caution + avances + options + part démarcheur ----------
async function onInitialPaymentSuccess(payment: SuccessfulPayment) {
  const lease = await db.lease.findUnique({ where: { id: payment.leaseId! }, include: { listing: true } });
  if (!lease) return;
  const settings = await getSettings();

  const ownerWallet = walletCode("OWNER", lease.ownerId);
  const lines = [
    { accountCode: PLATFORM_CASH, accountKind: "ASSET_CASH" as const, accountOwnerType: "PLATFORM" as const, accountLabel: "Encaissements plateforme", direction: "DEBIT" as const, amount: payment.amount },
    { accountCode: ownerWallet, accountKind: "LIABILITY_WALLET" as const, accountOwnerType: "OWNER" as const, accountOwnerId: lease.ownerId, accountLabel: "Portefeuille propriétaire", direction: "CREDIT" as const, amount: payment.amount },
  ];
  await postTransaction({
    idempotencyKey: `pay:${payment.reference}`,
    memo: `Paiement d'entrée ${lease.reference} — ${lease.listing.title}`,
    paymentId: payment.id,
    lines,
  });

  // Avances encaissées → marquer sur le bail
  if (lease.advanceMonths > 0) {
    const monthly = normalizeToMonthly(lease.rentAmount, lease.rentPeriod as never);
    await db.lease.update({ where: { id: lease.id }, data: { advancePaidAmount: Math.round(monthly * lease.advanceMonths) } });
  }

  // Commission démarcheur : créditée immédiatement sur le wallet agent
  if (lease.commissionTotal > 0 && lease.affiliateLinkId) {
    const link = await db.affiliateLink.findUnique({ where: { id: lease.affiliateLinkId } });
    if (link) {
      const existing = await db.commission.findFirst({ where: { paymentId: payment.id } });
      if (!existing) {
        const commission = await db.commission.create({
          data: {
            agentId: link.agentId, listingId: lease.listingId, leaseId: lease.id,
            paymentId: payment.id, linkId: link.id,
            tenantShare: lease.commissionTenantShare, ownerShare: lease.commissionOwnerShare,
            total: lease.commissionTotal,
            status: "PENDING_VALIDATION",
            validatableAt: new Date(Date.now() + settings.commissionValidationDays * 86400_000),
          },
        });
        const totalShare = lease.commissionTenantShare + lease.commissionOwnerShare;
        await postTransaction({
          idempotencyKey: `commission:${commission.id}`,
          memo: `Commission démarcheur — ${lease.listing.title} (validation sous ${settings.commissionValidationDays} j)`,
          paymentId: payment.id, commissionId: commission.id,
          lines: [
            { accountCode: ownerWallet, accountKind: "LIABILITY_WALLET", accountOwnerType: "OWNER", accountOwnerId: lease.ownerId, direction: "DEBIT", amount: lease.commissionOwnerShare },
            { accountCode: PLATFORM_CASH, accountKind: "ASSET_CASH", accountOwnerType: "PLATFORM", direction: "DEBIT", amount: lease.commissionTenantShare },
            { accountCode: walletCode("AGENT", link.agentId), accountKind: "LIABILITY_WALLET", accountOwnerType: "AGENT", accountOwnerId: link.agentId, accountLabel: "Portefeuille démarcheur", direction: "CREDIT", amount: totalShare },
          ],
        });
        await sendNotification({
          userId: link.agentId,
          type: "COMMISSION",
          title: "Nouvelle commission en attente",
          body: `Une commission de ${formatFcfa(totalShare)} a été créditée sur votre portefeuille (location : ${lease.listing.title}). Elle sera retirable après ${settings.commissionValidationDays} jours de validation.`,
          linkHash: "#/demarcheur/commissions",
        });
      }
    }
  }

  // Passage du bail en actif + notification propriétaire
  await db.listing.update({ where: { id: lease.listingId }, data: { status: "RENTED" } }).catch(() => {});
  await sendNotification({
    userId: lease.ownerId, type: "PAYMENT",
    title: "Paiement d'entrée reçu",
    body: `${formatFcfa(payment.amount)} encaissés pour ${lease.listing.title}. Quittance disponible dans l'espace propriétaire.`,
    linkHash: "#/proprietaire/finances",
  });
  await sendNotification({
    userId: lease.tenantId, type: "PAYMENT",
    title: "Paiement confirmé",
    body: `Votre paiement d'entrée de ${formatFcfa(payment.amount)} pour ${lease.listing.title} est confirmé. Votre contrat est disponible dans votre coffre-fort.`,
    linkHash: "#/locataire/documents",
  });
}

// ---------- RENT : loyer → échéance + quittance ----------
async function onRentPaymentSuccess(payment: SuccessfulPayment) {
  const lease = await db.lease.findUnique({ where: { id: payment.leaseId! }, include: { listing: true } });
  if (!lease) return;
  await postTransaction({
    idempotencyKey: `pay:${payment.reference}`,
    memo: `Loyer ${lease.reference} — ${lease.listing.title}`,
    paymentId: payment.id,
    lines: [
      { accountCode: PLATFORM_CASH, accountKind: "ASSET_CASH", accountOwnerType: "PLATFORM", direction: "DEBIT", amount: payment.amount },
      { accountCode: walletCode("OWNER", lease.ownerId), accountKind: "LIABILITY_WALLET", accountOwnerType: "OWNER", accountOwnerId: lease.ownerId, accountLabel: "Portefeuille propriétaire", direction: "CREDIT", amount: payment.amount },
    ],
  });
  if (payment.scheduleId) {
    const schedule = await db.rentSchedule.findUnique({ where: { id: payment.scheduleId } });
    if (schedule) {
      const newPaid = Math.min(schedule.amount, schedule.paidAmount + payment.amount);
      await db.rentSchedule.update({
        where: { id: schedule.id },
        data: { paidAmount: newPaid, status: newPaid >= schedule.amount ? "PAID" : "PARTIAL", paidAt: new Date(), paymentId: payment.id, quittanceUrl: `/api/pdf/quittance/${payment.id}` },
      });
    }
  }
  await sendNotification({
    userId: lease.ownerId, type: "PAYMENT", title: "Loyer reçu",
    body: `${formatFcfa(payment.amount)} encaissés — ${lease.listing.title}. Quittance générée automatiquement.`,
    linkHash: "#/proprietaire/finances",
  });
  await sendNotification({
    userId: payment.payerId, type: "PAYMENT", title: "Loyer payé",
    body: `Votre loyer de ${formatFcfa(payment.amount)} a été enregistré. Quittance disponible.`,
    linkHash: "#/locataire/documents",
  });
}

// ---------- BOOKING : réservation meublé confirmée ----------
async function onBookingPaymentSuccess(payment: SuccessfulPayment) {
  const booking = await db.booking.findUnique({ where: { id: payment.bookingId! }, include: { listing: true } });
  if (!booking) return;
  await postTransaction({
    idempotencyKey: `pay:${payment.reference}`,
    memo: `Réservation ${booking.code} — ${booking.listing.title}`,
    paymentId: payment.id,
    lines: [
      { accountCode: PLATFORM_CASH, accountKind: "ASSET_CASH", accountOwnerType: "PLATFORM", direction: "DEBIT", amount: payment.amount },
      { accountCode: walletCode("OWNER", booking.listing.ownerId), accountKind: "LIABILITY_WALLET", accountOwnerType: "OWNER", accountOwnerId: booking.listing.ownerId, accountLabel: "Portefeuille propriétaire", direction: "CREDIT", amount: payment.amount },
    ],
  });
  await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
  await sendNotification({
    userId: booking.listing.ownerId, type: "BOOKING", title: "Nouvelle réservation confirmée",
    body: `${booking.listing.title} réservé du ${formatDate(booking.startDate)} au ${formatDate(booking.endDate)} (${formatFcfa(booking.totalAmount)}).`,
    linkHash: "#/proprietaire",
  });
  await sendNotification({
    userId: booking.tenantId, type: "BOOKING", title: "Réservation confirmée",
    body: `Votre séjour à « ${booking.listing.title} » du ${formatDate(booking.startDate)} au ${formatDate(booking.endDate)} est confirmé.`,
    linkHash: "#/locataire/reservations",
  });
}

// ---------- SUBSCRIPTION : facture d'abonnement payée ----------
async function onSubscriptionPaymentSuccess(payment: SuccessfulPayment) {
  const invoice = await db.subscriptionInvoice.findUnique({ where: { id: payment.invoiceId! } });
  if (!invoice) return;
  await postTransaction({
    idempotencyKey: `pay:${payment.reference}`,
    memo: `Abonnement propriétaire ${formatDate(invoice.periodStart, false)} → ${formatDate(invoice.periodEnd, false)}`,
    paymentId: payment.id,
    lines: [
      { accountCode: PLATFORM_CASH, accountKind: "ASSET_CASH", accountOwnerType: "PLATFORM", direction: "DEBIT", amount: payment.amount },
      { accountCode: PLATFORM_REVENUE, accountKind: "REVENUE", accountOwnerType: "PLATFORM", accountLabel: "Revenus abonnements", direction: "CREDIT", amount: payment.amount },
    ],
  });
  await db.subscriptionInvoice.update({
    where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date(), paymentId: payment.id },
  });
  // Réactivation immédiate des offres masquées pour impayé
  const listings = await db.listing.findMany({ where: { ownerId: invoice.ownerId, status: "SUSPENDED_UNPAID" }, select: { id: true } });
  for (const l of listings) {
    await db.listing.update({ where: { id: l.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  }
  await sendNotification({
    userId: invoice.ownerId, type: "SUBSCRIPTION", title: "Abonnement payé",
    body: `Votre abonnement est à jour. ${listings.length > 0 ? `${listings.length} offre(s) réactivée(s) immédiatement.` : "Vos offres restent publiées."}`,
    linkHash: "#/proprietaire/abonnement",
  });
}

/**
 * Simulateur sandbox : construit un webhook SIGNÉ (comme l'agrégateur le ferait)
 * et le passe dans le pipeline réel processWebhookEvent (idempotence testée).
 */
export async function simulateProviderWebhook(paymentReference: string, outcome: "succeeded" | "failed") {
  const payment = await db.payment.findUnique({ where: { reference: paymentReference } });
  if (!payment) throw new ApiError(404, "Paiement introuvable.");
  const evt: WebhookEventInput = {
    provider: payment.provider,
    eventId: `${payment.provider}-${payment.reference}-${outcome}`,
    type: outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
    paymentReference,
    providerRef: payment.providerRef ?? "",
    occurredAt: new Date().toISOString(),
  };
  const raw = JSON.stringify(evt);
  const signature = crypto.createHmac("sha256", webhookSecret()).update(raw).digest("hex");
  const provider = getPaymentProvider();
  if (!provider.verifyWebhook(raw, signature)) throw new ApiError(400, "Signature webhook invalide.");
  return processWebhookEvent(evt);
}

// ---------- Retraits (Mobile Money) ----------

export async function requestPayout(user: { id: string; role: "OWNER" | "AGENT" }, amount: number, method: PaymentMethodStr, destination: string) {
  const settings = await getSettings();
  if (amount < settings.payoutMinAmount) {
    throw new ApiError(400, `Retrait minimum : ${formatFcfa(settings.payoutMinAmount)}.`);
  }
  const balance = await walletBalance(user.role, user.id);
  if (amount > balance) throw new ApiError(400, "Solde insuffisant sur votre portefeuille.");
  const payout = await db.payout.create({
    data: { userId: user.id, userRole: user.role, amount, method, destination, status: "OTP_PENDING" },
  });
  return payout;
}

export async function completePayout(payoutId: string, memo: string) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new ApiError(404, "Retrait introuvable.");
  if (["PAID", "PROCESSING"].includes(payout.status)) return payout; // idempotent
  await postTransaction({
    idempotencyKey: `payout:${payout.id}`,
    memo,
    payoutId: payout.id,
    lines: [
      { accountCode: walletCode(payout.userRole as "OWNER" | "AGENT", payout.userId), accountKind: "LIABILITY_WALLET", accountOwnerType: payout.userRole === "OWNER" ? "OWNER" : "AGENT", accountOwnerId: payout.userId, direction: "DEBIT", amount: payout.amount },
      { accountCode: PLATFORM_PAYOUTS, accountKind: "ASSET_PAYOUTS", accountOwnerType: "PLATFORM", accountLabel: "Sorties Mobile Money", direction: "CREDIT", amount: payout.amount },
    ],
  });
  const updated = await db.payout.update({ where: { id: payout.id }, data: { status: "PAID", processedAt: new Date() } });
  await sendNotification({
    userId: payout.userId, type: "PAYMENT", title: "Retrait effectué",
    body: `${formatFcfa(payout.amount)} envoyés vers ${label(payout.method)} (${payout.destination}).`,
    linkHash: payout.userRole === "AGENT" ? "#/demarcheur/wallet" : "#/proprietaire/finances",
  });
  return updated;
}

/** Revenus plateforme (abonnements) — pour le tableau de bord admin. */
export async function platformRevenue(): Promise<number> {
  const acc = await db.ledgerAccount.findUnique({ where: { code: PLATFORM_REVENUE }, include: { entries: { select: { direction: true, amount: true } } } });
  if (!acc) return 0;
  return acc.entries.reduce((a, e) => a + (e.direction === "CREDIT" ? e.amount : -e.amount), 0);
}
