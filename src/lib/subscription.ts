// ============================================================
// LocaBénin — Moteur d'abonnements propriétaires
// Règle : publication payante PAR MOIS et PAR CATÉGORIE ACTIVE,
// quel que soit le nombre d'offres dans la catégorie.
//   • Logements vides : 5 000 FCFA/mois (tarif admin-editable)
//   • Appartements meublés : 10 000 FCFA/mois
//   • Bureaux : 10 000 FCFA/mois
// Cycle : facturation au 1er du mois (évaluation à la volée — pas de cron
// en sandbox ; en production : Vercel Cron quotidien, voir DECISIONS.md).
// Impayé au-delà de la grâce → offres de la catégorie MASQUÉES
// (status SUSPENDED_UNPAID) ; paiement → réactivation immédiate.
// ============================================================

import "server-only";
import { db } from "./db";
import { getSettings, categoryForType } from "./settings";
import { formatFcfa, formatDate } from "./finance";
import { sendNotification } from "./notifications";
import type { ListingCategory } from "./constants";

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

/** Catégories ACTIVES du propriétaire = catégories ayant au moins une offre non archivée. */
export async function activeCategories(ownerId: string): Promise<Array<{ category: ListingCategory; listingCount: number }>> {
  const listings = await db.listing.findMany({
    where: { ownerId, deletedAt: null, status: { notIn: ["ARCHIVED", "DRAFT"] } },
    select: { category: true },
  });
  const counts = new Map<string, number>();
  for (const l of listings) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, listingCount]) => ({ category: category as ListingCategory, listingCount }));
}

/** Montant d'abonnement en temps réel selon les catégories actives. */
export async function subscriptionSummary(ownerId: string) {
  const [pricing, cats, settings] = await Promise.all([getCategoryPricingMap(), activeCategories(ownerId), getSettings()]);
  const lineItems = cats.map((c) => ({
    category: c.category as string,
    label: pricing[c.category]?.label ?? c.category,
    price: pricing[c.category]?.price ?? 0,
    listingCount: c.listingCount,
  }));
  const total = lineItems.reduce((a, l) => a + l.price, 0);
  const invoice = await db.subscriptionInvoice.findFirst({
    where: { ownerId, periodStart: startOfMonth() },
    orderBy: { createdAt: "desc" },
  });
  const overdue = await db.subscriptionInvoice.findFirst({
    where: { ownerId, status: { in: ["DUE", "OVERDUE"] }, graceUntil: { lt: new Date() } },
  });
  return {
    lineItems, total,
    categories: cats.map((c) => c.category),
    currentInvoice: invoice,
    hasOverdueBeyondGrace: Boolean(overdue),
    graceDays: settings.subscriptionGraceDays,
  };
}

async function getCategoryPricingMap(): Promise<Record<string, { price: number; label: string }>> {
  const rows = await db.categoryPricing.findMany();
  return Object.fromEntries(rows.map((r) => [r.category, { price: r.monthlyPrice, label: r.label }]));
}

/**
 * Évaluation du cycle de facturation (appelée au chargement du tableau de bord
 * propriétaire et avant les requêtes publiques) :
 *  - crée la facture du mois si absente ;
 *  - passe en OVERDUE les factures dépassées ;
 *  - masque les offres des catégories impayées au-delà de la grâce ;
 *  - émet les rappels J-7 / J-3 / J-1.
 */
export async function ensureBillingCycle(ownerId: string) {
  const [pricing, cats, settings] = await Promise.all([getCategoryPricingMap(), activeCategories(ownerId), getSettings()]);
  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();
  const total = cats.reduce((a, c) => a + (pricing[c.category]?.price ?? 0), 0);

  let invoice = await db.subscriptionInvoice.findUnique({
    where: { ownerId_periodStart: { ownerId, periodStart } },
  });

  if (!invoice) {
    if (total === 0) return; // aucune catégorie active : rien à facturer
    const dueDate = new Date(periodStart.getTime() + 7 * 86400_000);
    invoice = await db.subscriptionInvoice.create({
      data: {
        ownerId, periodStart, periodEnd, amount: total,
        lineItemsJson: JSON.stringify(cats.map((c) => ({
          category: c.category, label: pricing[c.category]?.label ?? c.category,
          price: pricing[c.category]?.price ?? 0, listingCount: c.listingCount,
        }))),
        dueDate, graceUntil: new Date(dueDate.getTime() + settings.subscriptionGraceDays * 86400_000),
        status: "DUE",
      },
    });
    await sendNotification({
      userId: ownerId, type: "SUBSCRIPTION",
      title: `Facture d'abonnement : ${formatFcfa(total)}`,
      body: `Votre abonnement du mois (${cats.map((c) => pricing[c.category]?.label ?? c.category).join(", ")}) est émis. Échéance le ${formatDate(dueDate)}.`,
      linkHash: "#/proprietaire/abonnement",
    }, []);
  }

  if (invoice.status === "DUE" && new Date() > invoice.dueDate) {
    await db.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } });
  }

  // Rappels J-7 / J-3 / J-1 (une seule fois par jalon)
  if (["DUE", "OVERDUE"].includes(invoice.status)) {
    const sent: number[] = JSON.parse(invoice.remindersSentJson ?? "[]");
    const daysLeft = Math.ceil((invoice.dueDate.getTime() - Date.now()) / 86400_000);
    for (const milestone of [7, 3, 1]) {
      if (daysLeft === milestone && !sent.includes(milestone)) {
        await sendNotification({
          userId: ownerId, type: "SUBSCRIPTION",
          title: `Rappel : abonnement à payer (J-${milestone})`,
          body: `Votre facture de ${formatFcfa(invoice.amount)} arrive à échéance le ${formatDate(invoice.dueDate)}. Passé un délai de grâce de ${settings.subscriptionGraceDays} jours, vos offres seront masquées.`,
          linkHash: "#/proprietaire/abonnement",
        });
        sent.push(milestone);
      }
    }
    await db.subscriptionInvoice.update({ where: { id: invoice.id }, data: { remindersSentJson: JSON.stringify(sent) } });
  }

  // Masquage automatique au-delà de la grâce (par catégorie impayée)
  if (invoice.status === "OVERDUE" && new Date() > invoice.graceUntil && invoice.paidAt == null) {
    const items: Array<{ category: string }> = JSON.parse(invoice.lineItemsJson ?? "[]");
    for (const item of items) {
      await db.listing.updateMany({
        where: { ownerId, category: item.category, status: { in: ["PUBLISHED", "RESERVED"] } },
        data: { status: "SUSPENDED_UNPAID" },
      });
      await sendNotification({
        userId: ownerId, type: "SUBSCRIPTION",
        title: "Offres masquées : abonnement impayé",
        body: `Vos offres « ${item.category} » sont masquées faute de paiement. Réactivation immédiate après paiement de ${formatFcfa(invoice.amount)}.`,
        linkHash: "#/proprietaire/abonnement",
      });
    }
  }
}

/**
 * Recalcul après activation/désactivation d'une catégorie :
 * ajuste la facture du mois courant (lignes + montant) si elle est impayée.
 */
export async function refreshCurrentInvoice(ownerId: string) {
  const [pricing, cats] = await Promise.all([getCategoryPricingMap(), activeCategories(ownerId)]);
  const periodStart = startOfMonth();
  const invoice = await db.subscriptionInvoice.findUnique({
    where: { ownerId_periodStart: { ownerId, periodStart } },
  });
  const total = cats.reduce((a, c) => a + (pricing[c.category]?.price ?? 0), 0);
  const lineItems = JSON.stringify(cats.map((c) => ({
    category: c.category, label: pricing[c.category]?.label ?? c.category,
    price: pricing[c.category]?.price ?? 0, listingCount: c.listingCount,
  })));
  if (!invoice || invoice.paidAt) return;
  if (invoice.amount !== total) {
    await db.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { amount: total, lineItemsJson: lineItems, status: total === 0 ? "CANCELLED" : invoice.status },
    });
  }
}

/** Utilisé à la création/modification d'offre : catégorie d'abonnement d'un type. */
export async function resolveCategory(type: string, genre: string): Promise<{ category: string }> {
  const settings = await getSettings();
  if (genre === "FURNISHED") return { category: "FURNISHED" };
  return { category: categoryForType(type, settings) };
}
