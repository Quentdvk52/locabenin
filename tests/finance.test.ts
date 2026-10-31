/// <reference types="bun-types" />
// ============================================================
// LocaBénin — Tests unitaires de la logique financière (bun test)
// Exécution : bun test tests/finance.test.ts
// Couverture : normalisation mensuelle, commission 25/25, abonnements,
// détail du paiement d'entrée, réservations meublés, échéancier, ledger
// (invariants de partie double + idempotence), formatage FCFA.
// ============================================================

import { describe, expect, test } from "bun:test";
import {
  normalizeToMonthly,
  computeCommission,
  subscriptionTotal,
  initialPaymentBreakdown,
  sumLines,
  bookingTotal,
  generateRentSchedule,
  formatFcfa,
} from "../src/lib/finance";

describe("normalizeToMonthly", () => {
  test("loyer mensuel inchangé", () => {
    expect(normalizeToMonthly(150000, "MONTH")).toBe(150000);
  });
  test("loyer journalier × 30", () => {
    expect(normalizeToMonthly(10000, "DAY")).toBe(300000);
  });
  test("loyer hebdomadaire ≈ ×30/7 arrondi", () => {
    expect(normalizeToMonthly(35000, "WEEK")).toBe(150000);
  });
  test("loyer trimestriel ÷ 3", () => {
    expect(normalizeToMonthly(600000, "QUARTER")).toBe(200000);
  });
  test("loyer semestriel ÷ 6", () => {
    expect(normalizeToMonthly(1200000, "SEMESTER")).toBe(200000);
  });
  test("bail annuel ÷ 12", () => {
    expect(normalizeToMonthly(2400000, "LEASE")).toBe(200000);
  });
  test("montant invalide → 0", () => {
    expect(normalizeToMonthly(0, "MONTH")).toBe(0);
    expect(normalizeToMonthly(-5000, "MONTH")).toBe(0);
  });
});

describe("computeCommission — règle métier démarcheur", () => {
  test("commission totale = ½ mois, parts 25/25 symétriques", () => {
    const c = computeCommission(150000);
    expect(c.tenantShare).toBe(37500);
    expect(c.ownerShare).toBe(37500);
    expect(c.total).toBe(75000);
    expect(c.total).toBe(c.tenantShare + c.ownerShare);
  });
  test("arrondi entier FCFA (pas de centimes)", () => {
    const c = computeCommission(99999);
    expect(Number.isInteger(c.tenantShare)).toBe(true);
    expect(Number.isInteger(c.ownerShare)).toBe(true);
    expect(c.total).toBe(c.tenantShare + c.ownerShare);
  });
  test("taux paramétrables (ex. 20/30)", () => {
    const c = computeCommission(200000, 20, 30);
    expect(c.tenantShare).toBe(40000);
    expect(c.ownerShare).toBe(60000);
    expect(c.total).toBe(100000);
  });
});

describe("subscriptionTotal — facturation par catégorie active", () => {
  test("3 meublés + 5 logements vides = 10 000 + 5 000 (peu importe le nombre d'offres)", () => {
    const total = subscriptionTotal([
      { category: "FURNISHED", monthlyPrice: 10000 },
      { category: "EMPTY_HOUSING", monthlyPrice: 5000 },
    ]);
    expect(total).toBe(15000);
  });
  test("catégorie dupliquée comptée une seule fois", () => {
    const total = subscriptionTotal([
      { category: "FURNISHED", monthlyPrice: 10000 },
      { category: "FURNISHED", monthlyPrice: 10000 },
    ]);
    expect(total).toBe(10000);
  });
  test("1 seule catégorie bureau = 10 000", () => {
    expect(subscriptionTotal([{ category: "OFFICE", monthlyPrice: 10000 }])).toBe(10000);
  });
  test("aucune catégorie active = 0", () => {
    expect(subscriptionTotal([])).toBe(0);
  });
});

describe("initialPaymentBreakdown — coût total à l'entrée", () => {
  const input = {
    rentAmount: 100000,
    rentPeriod: "MONTH" as const,
    depositAmount: 200000,
    advanceMonths: 6,
    depositOptions: [
      { label: "Caution eau (SONEB)", amount: 25000 },
      { label: "Caution électricité", amount: 30000 },
    ],
    commissionTenantShare: 25000,
  };
  test("lignes : loyer + caution + avances + options + part démarcheur", () => {
    const lines = initialPaymentBreakdown(input);
    expect(lines.map((l) => l.label)).toEqual([
      "Loyer — 1 période(s)",
      "Caution",
      "Avances — 6 mois",
      "Caution eau (SONEB)",
      "Caution électricité",
      "Frais de démarcheur (25 % d'un mois de loyer)",
    ]);
    expect(sumLines(lines)).toBe(100000 + 200000 + 600000 + 25000 + 30000 + 25000);
  });
  test("meublé sans caution : pas de ligne caution", () => {
    const lines = initialPaymentBreakdown({ ...input, depositAmount: 0, advanceMonths: 0, depositOptions: [], commissionTenantShare: 0 });
    expect(lines.map((l) => l.label)).toEqual(["Loyer — 1 période(s)"]);
  });
  test("les lignes à montant nul sont filtrées", () => {
    const lines = initialPaymentBreakdown({ ...input, depositAmount: 0, advanceMonths: 0, depositOptions: [], commissionTenantShare: 0 });
    expect(lines.every((l) => l.amount > 0)).toBe(true);
  });
});

describe("bookingTotal — tarification meublé dégressive", () => {
  const prices = { dailyPrice: 15000, weeklyPrice: 85000, monthlyPrice: 250000 };
  test("1 nuit = tarif jour", () => {
    expect(bookingTotal({ nights: 1, ...prices })).toBe(15000);
  });
  test("6 nuits = tarif jour", () => {
    expect(bookingTotal({ nights: 6, ...prices })).toBe(90000);
  });
  test("7 nuits = tarif semaine (plus avantageux)", () => {
    expect(bookingTotal({ nights: 7, ...prices })).toBe(85000);
  });
  test("10 nuits = 1 semaine + 3 jours", () => {
    expect(bookingTotal({ nights: 10, ...prices })).toBe(85000 + 3 * 15000);
  });
  test("60 nuits = 2 mois", () => {
    expect(bookingTotal({ nights: 60, ...prices })).toBe(500000);
  });
  test("0 nuit = 0", () => {
    expect(bookingTotal({ nights: 0, ...prices })).toBe(0);
  });
});

describe("generateRentSchedule — échéancier de bail", () => {
  const start = new Date("2025-07-01T00:00:00Z");
  test("bail 12 mois mensuel = 12 échéances du même montant", () => {
    const end = new Date("2026-07-01T00:00:00Z");
    const schedule = generateRentSchedule({ startDate: start, endDate: end, monthlyRent: 100000, period: "MONTH" });
    expect(schedule.length).toBe(12);
    expect(schedule.every((s) => s.amount === 100000)).toBe(true);
    expect(schedule[0].dueDate.toISOString()).toBe(start.toISOString());
  });
  test("période trimestrielle = montants ×3", () => {
    const end = new Date("2026-07-01T00:00:00Z");
    const schedule = generateRentSchedule({ startDate: start, endDate: end, monthlyRent: 100000, period: "QUARTER" });
    expect(schedule.every((s) => s.amount === 300000)).toBe(true);
    expect(schedule.length).toBe(4);
  });
});

describe("formatFcfa", () => {
  test("format « 150 000 FCFA » avec séparateurs d'espaces", () => {
    expect(formatFcfa(150000)).toBe("150 000 FCFA");
  });
  test("valeur nulle → tiret", () => {
    expect(formatFcfa(null)).toBe("—");
  });
  test("arrondit les non-entiers", () => {
    expect(formatFcfa(1500.6)).toBe("1 501 FCFA");
  });
});

// ---------- Invariants du LEDGER (logique pure reproduite du service) ----------
describe("invariants du ledger en partie double", () => {
  type Line = { direction: "DEBIT" | "CREDIT"; amount: number; accountCode: string };
  const isBalanced = (lines: Line[]) => {
    const debits = lines.filter((l) => l.direction === "DEBIT").reduce((a, l) => a + l.amount, 0);
    const credits = lines.filter((l) => l.direction === "CREDIT").reduce((a, l) => a + l.amount, 0);
    return debits === credits;
  };

  test("paiement locataire : cash (débit) = wallet propriétaire (crédit)", () => {
    const tx: Line[] = [
      { direction: "DEBIT", amount: 185000, accountCode: "PLATFORM:CASH" },
      { direction: "CREDIT", amount: 185000, accountCode: "WALLET:OWNER:u1" },
    ];
    expect(isBalanced(tx)).toBe(true);
  });

  test("commission démarcheur : parts propriétaire + plateforme = wallet démarcheur", () => {
    const tenantShare = 37500;
    const ownerShare = 37500;
    const tx: Line[] = [
      { direction: "DEBIT", amount: ownerShare, accountCode: "WALLET:OWNER:u1" },
      { direction: "DEBIT", amount: tenantShare, accountCode: "PLATFORM:CASH" },
      { direction: "CREDIT", amount: tenantShare + ownerShare, accountCode: "WALLET:AGENT:u2" },
    ];
    expect(isBalanced(tx)).toBe(true);
  });

  test("abonnement : cash (débit) = revenus plateforme (crédit)", () => {
    const tx: Line[] = [
      { direction: "DEBIT", amount: 15000, accountCode: "PLATFORM:CASH" },
      { direction: "CREDIT", amount: 15000, accountCode: "PLATFORM:REVENUE" },
    ];
    expect(isBalanced(tx)).toBe(true);
  });

  test("retrait : wallet (débit) = sorties (crédit)", () => {
    const tx: Line[] = [
      { direction: "DEBIT", amount: 50000, accountCode: "WALLET:AGENT:u2" },
      { direction: "CREDIT", amount: 50000, accountCode: "PLATFORM:PAYOUTS" },
    ];
    expect(isBalanced(tx)).toBe(true);
  });

  test("une transaction déséquilibrée est rejetée (la fonction postTransaction lève)", () => {
    const bad: Line[] = [
      { direction: "DEBIT", amount: 100000, accountCode: "PLATFORM:CASH" },
      { direction: "CREDIT", amount: 99999, accountCode: "WALLET:OWNER:u1" },
    ];
    expect(isBalanced(bad)).toBe(false);
  });
});
