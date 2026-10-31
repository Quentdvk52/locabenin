// ============================================================
// LocaBénin — LEDGER en partie double
// Règles d'or :
//  1. AUCUN champ « solde » modifié directement : les soldes sont DÉRIVÉS
//     des écritures immuables (somme crédits − débits selon le sens normal).
//  2. Une transaction = un ensemble d'écritures ÉQUILIBRÉ (Σ débits = Σ crédits),
//     écritues ATOMIQUEMENT avec une clé d'idempotence unique.
//  3. Un double appel (webhook rejoué, retry réseau) ne crée JAMAIS une
//     deuxième série d'écritures : la clé unique fait échouer/ignorer le doublon.
// Sens normal : ASSET → débit augmente ; LIABILITY / REVENUE → crédit augmente.
// ============================================================

import "server-only";
import { db } from "./db";
import { ApiError } from "./api";

export type AccountKind = "ASSET_CASH" | "ASSET_PAYOUTS" | "LIABILITY_WALLET" | "LIABILITY_ESCROW" | "REVENUE" | "EXPENSE";
export type AccountOwnerType = "PLATFORM" | "OWNER" | "AGENT" | "TENANT";

export const PLATFORM_CASH = "PLATFORM:CASH";
export const PLATFORM_PAYOUTS = "PLATFORM:PAYOUTS";
export const PLATFORM_REVENUE = "PLATFORM:REVENUE";

export function walletCode(userRole: "OWNER" | "AGENT", userId: string) {
  return `WALLET:${userRole}:${userId}`;
}
export function escrowCode(tenantId: string) {
  return `ESCROW:TENANT:${tenantId}`;
}

export interface LedgerLine {
  accountCode: string;
  accountKind: AccountKind;
  accountOwnerType: AccountOwnerType;
  accountOwnerId?: string;
  accountLabel?: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
}

export interface PostTransactionInput {
  idempotencyKey: string;
  memo: string;
  paymentId?: string;
  commissionId?: string;
  payoutId?: string;
  lines: LedgerLine[];
}

/** Crée (ou retrouve) un compte du ledger. */
export async function ensureAccount(line: LedgerLine) {
  return db.ledgerAccount.upsert({
    where: { code: line.accountCode },
    create: {
      code: line.accountCode,
      kind: line.accountKind,
      ownerType: line.accountOwnerType,
      ownerId: line.accountOwnerId ?? null,
      label: line.accountLabel ?? line.accountCode,
    },
    update: {},
  });
}

/**
 * Écrit une transaction équilibrée de façon atomique et idempotente.
 * - Σ débits doit égaler Σ crédits sinon rejet (invariant de partie double).
 * - Si la clé d'idempotence existe déjà → transaction déjà traitée, no-op.
 */
export async function postTransaction(input: PostTransactionInput): Promise<{ idempotent: boolean }> {
  if (input.lines.length < 2) throw new ApiError(500, "Transaction incomplète (moins de 2 lignes).");
  const sum = (dir: "DEBIT" | "CREDIT") =>
    input.lines.filter((l) => l.direction === dir).reduce((a, l) => a + Math.round(l.amount), 0);
  const debits = sum("DEBIT");
  const credits = sum("CREDIT");
  if (debits !== credits || debits <= 0) {
    throw new ApiError(500, `Transaction déséquilibrée refusée (débits=${debits}, crédits=${credits}).`);
  }
  if (input.lines.some((l) => !Number.isInteger(l.amount) || l.amount <= 0)) {
    throw new ApiError(500, "Montants du ledger : entiers strictement positifs requis.");
  }

  const existing = await db.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
  if (existing) return { idempotent: true };

  await db.$transaction(async (tx) => {
    for (const line of input.lines) {
      const account = await tx.ledgerAccount.upsert({
        where: { code: line.accountCode },
        create: {
          code: line.accountCode, kind: line.accountKind, ownerType: line.accountOwnerType,
          ownerId: line.accountOwnerId ?? null, label: line.accountLabel ?? line.accountCode,
        },
        update: {},
      });
      await tx.ledgerEntry.create({
        data: {
          accountId: account.id, direction: line.direction, amount: line.amount,
          memo: input.memo, paymentId: input.paymentId ?? null,
          commissionId: input.commissionId ?? null, payoutId: input.payoutId ?? null,
          idempotencyKey: `${input.idempotencyKey}:${line.accountCode}:${line.direction}`,
        },
      });
    }
  });
  return { idempotent: false };
}

/** Solde d'un portefeuille (liabilité : ce que la plateforme doit à l'utilisateur). */
export async function walletBalance(userRole: "OWNER" | "AGENT", userId: string): Promise<number> {
  const code = walletCode(userRole, userId);
  const account = await db.ledgerAccount.findUnique({
    where: { code },
    include: { entries: { select: { direction: true, amount: true } } },
  });
  if (!account) return 0;
  return account.entries.reduce(
    (acc, e) => acc + (e.direction === "CREDIT" ? e.amount : -e.amount), 0,
  );
}

/** Réconciliation : Σ globale débits = Σ crédits sur tout le ledger. */
export async function reconcileLedger(): Promise<{ debits: number; credits: number; balanced: boolean }> {
  const entries = await db.ledgerEntry.findMany({ select: { direction: true, amount: true } });
  const debits = entries.filter((e) => e.direction === "DEBIT").reduce((a, e) => a + e.amount, 0);
  const credits = entries.filter((e) => e.direction === "CREDIT").reduce((a, e) => a + e.amount, 0);
  return { debits, credits, balanced: debits === credits };
}

/** Détail des écritures d'un portefeuille (relevé). */
export async function walletStatement(userRole: "OWNER" | "AGENT", userId: string, take = 100) {
  const code = walletCode(userRole, userId);
  const account = await db.ledgerAccount.findUnique({
    where: { code },
    include: {
      entries: {
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, direction: true, amount: true, memo: true, createdAt: true, paymentId: true, payoutId: true },
      },
    },
  });
  return account?.entries ?? [];
}
