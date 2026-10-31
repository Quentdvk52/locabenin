"use client";

// ============================================================
// LocaBénin — Abonnement propriétaire
// Facturation PAR CATÉGORIE ACTIVE (pas par offre) : résumé temps
// réel, total mensuel, factures avec statuts + paiement, règles de
// grâce et de masquage automatique.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Info, Receipt, Building2, Clock, FileDown } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { PaymentDialog, type PaymentMethod } from "./components/PaymentDialog";
import { handleApiError, formatDateFr } from "./components/helpers";

interface SummaryData {
  lineItems: Array<{ category: string; label: string; price: number; listingCount: number }>;
  total: number;
  categories: string[];
  currentInvoice: { id: string; amount: number; status: string; dueDate: string; graceUntil: string } | null;
  hasOverdueBeyondGrace: boolean;
  graceDays: number;
}
interface InvoiceRow {
  id: string; periodStart: string; periodEnd: string; amount: number; status: string;
  dueDate: string; graceUntil: string; paidAt: string | null;
}

export default function OwnerSubscription() {
  const qc = useQueryClient();
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);

  const summary = useQuery<SummaryData>({
    queryKey: ["subscription", "summary"],
    queryFn: () => apiGet<SummaryData>("/api/subscription/summary"),
  });
  const invoices = useQuery<InvoiceRow[]>({
    queryKey: ["subscription", "invoices"],
    queryFn: () => apiGet<InvoiceRow[]>("/api/subscription/invoices"),
  });

  if (summary.isLoading || invoices.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <ViewHeader title="Abonnement" icon={CreditCard} subtitle="Chargement…" />
        <RowsSkeleton rows={4} />
      </div>
    );
  }
  if (summary.isError || !summary.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState
          message={summary.error instanceof Error ? summary.error.message : "Impossible de charger votre abonnement."}
          onRetry={() => void summary.refetch()}
        />
      </div>
    );
  }

  const s = summary.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader title="Abonnement" subtitle="Publication par catégorie, facturé au mois" icon={CreditCard} />

      {/* ---- Total mensuel ---- */}
      <section className="rounded-2xl border bg-card p-6 shadow-soft" aria-label="Total de l'abonnement">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total mensuel</p>
            <p className="font-display text-4xl font-bold tracking-tight text-primary">
              {formatFcfa(s.total)}<span className="text-base font-normal text-muted-foreground"> /mois</span>
            </p>
          </div>
          {s.currentInvoice && <StatusBadge status={s.currentInvoice.status} />}
        </div>

        {s.lineItems.length === 0 ? (
          <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
            Aucune catégorie active. Dès votre première offre publiée (ou en validation), la catégorie correspondante est facturée.
          </p>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border">
            {s.lineItems.map((li) => (
              <li key={li.category} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden />
                  {li.label}
                  <span className="text-xs text-muted-foreground">({li.listingCount} offre{li.listingCount > 1 ? "s" : ""})</span>
                </span>
                <span className="font-display font-bold">{formatFcfa(li.price)} /mois</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          Vous payez par catégorie, pas par offre : 1 ou 10 offres vides = {formatFcfa(5000)} / mois. Le total dépend uniquement des catégories actives.
        </p>
      </section>

      {/* ---- Règles de grâce ---- */}
      <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-label="Règles de grâce">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Clock className="size-4 text-muted-foreground" aria-hidden /> Délai de grâce & masquage automatique
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Facture émise le 1<sup>er</sup> du mois, échéance à J+7. Après un délai de grâce de <strong>{s.graceDays} jours</strong> sans paiement,
          les offres des catégories impayées sont <strong>masquées automatiquement</strong> (plus visibles dans la recherche).
          Dès le paiement, la réactivation est <strong>immédiate</strong>.
        </p>
        {s.hasOverdueBeyondGrace && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400">
            Votre compte est au-delà du délai de grâce : vos offres peuvent être masquées. Réglez la facture pour tout réactiver.
          </p>
        )}
      </section>

      {/* ---- Factures ---- */}
      <section className="space-y-3" aria-label="Historique des factures">
        <h2 className="font-display text-base font-semibold">Mes factures</h2>
        {(invoices.data ?? []).length === 0 ? (
          <EmptyState title="Aucune facture pour le moment" description="La première facture est émise dès l'activation d'une catégorie." icon={Receipt} />
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-2xl border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-medium">Période</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Grâce jusqu&apos;au</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">PDF</th>
                  <th className="px-4 py-3 font-medium sr-only">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(invoices.data ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateFr(inv.periodStart)} → {formatDateFr(inv.periodEnd)}</td>
                    <td className="px-4 py-3 font-display font-bold">{formatFcfa(inv.amount)}</td>
                    <td className="px-4 py-3">{formatDateFr(inv.graceUntil)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <a href={`/api/pdf/invoice/${inv.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <FileDown className="size-3.5" aria-hidden /> Facture
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {(inv.status === "DUE" || inv.status === "OVERDUE") && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setPayInvoice(inv)}>Payer</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PaymentDialog
        open={Boolean(payInvoice)}
        onOpenChange={(v) => !v && setPayInvoice(null)}
        title="Facture d'abonnement"
        description={payInvoice ? `Période du ${formatDateFr(payInvoice.periodStart)} au ${formatDateFr(payInvoice.periodEnd)}` : undefined}
        amount={payInvoice?.amount ?? 0}
        makePayment={async (method) => {
          if (!payInvoice) throw new Error("Aucune facture sélectionnée.");
          const res = await apiSend<{ payment: { reference: string }; mockConfirmToken?: string }>("/api/payments/initiate", "POST", {
            purpose: "SUBSCRIPTION",
            invoiceId: payInvoice.id,
            method,
          });
          return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken };
        }}
        onSuccess={() => {
          setPayInvoice(null);
          void qc.invalidateQueries({ queryKey: ["subscription"] });
          void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
          toast.success("Abonnement réglé : vos offres restent publiées.");
        }}
      />
    </div>
  );
}
