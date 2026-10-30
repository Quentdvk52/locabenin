"use client";

// ============================================================
// LocaBénin — Espace Locataire : coffre-fort documentaire
// Contrats de bail, quittances de loyer, reçus de réservations,
// factures (N/A pour les locataires) — groupés par type.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { FileText, ExternalLink, ShieldCheck, Lock, Receipt, Armchair, Ban, KeyRound } from "lucide-react";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/badges";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { navigate } from "@/lib/client/router";
import { guardedGet, type RawLease, type PaymentHistoryItem } from "./api";

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
    >
      {children}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

function Group({ title, icon: Icon, children, count }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; count: number }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label={title}>
      <h3 className="flex items-center gap-2 font-display text-base font-bold">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4.5" aria-hidden /></span>
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TenantDocuments() {
  const leases = useQuery({
    queryKey: ["leases"],
    queryFn: () => guardedGet<RawLease[]>("/api/leases"),
  });
  const history = useQuery({
    queryKey: ["payments-history"],
    queryFn: () => guardedGet<PaymentHistoryItem[]>("/api/payments/history"),
  });

  const loading = leases.isLoading || history.isLoading;
  const error = leases.isError || history.isError;

  const myLeases = leases.data ?? [];
  const payments = history.data ?? [];
  const rentReceipts = payments.filter((p) => p.purpose === "RENT" && p.status === "SUCCESS");
  const initialReceipts = payments.filter((p) => p.purpose === "INITIAL" && p.status === "SUCCESS");
  const bookingReceipts = payments.filter((p) => p.purpose === "BOOKING" && p.status === "SUCCESS");

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Coffre-fort</h2>
          <p className="text-sm text-muted-foreground">Tous vos documents locatifs, accessibles à tout moment.</p>
        </div>
        <p className="flex items-center gap-1.5 rounded-xl border bg-secondary/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Documents signés et horodatés, hash SHA-256 archivé
        </p>
      </div>

      {loading && <RowsSkeleton rows={5} />}
      {error && <ErrorState message="Impossible de charger vos documents." onRetry={() => { void leases.refetch(); void history.refetch(); }} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Contrats de bail */}
          <Group title="Contrats de bail" icon={KeyRound} count={myLeases.length}>
            {myLeases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bail pour l&apos;instant — le contrat apparaîtra ici dès sa création.</p>
            ) : (
              <ul className="space-y-2">
                {myLeases.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{l.listing.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.reference} · {formatDate(l.startDate)} ·{" "}
                        {l.tenantSignedAt ? "signé" : "non signé"}
                        {l.contractHash ? " · hash archivé" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={l.status} className="scale-90" />
                      <DocLink href={l.contractPdfUrl ?? `/api/pdf/contract/${l.id}`}>Contrat PDF</DocLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Group>

          {/* Quittances de loyer */}
          <Group title="Quittances de loyer" icon={Receipt} count={rentReceipts.length}>
            {rentReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune quittance — elles sont générées automatiquement à chaque loyer payé.</p>
            ) : (
              <ul className="styled-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
                {rentReceipts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.confirmedAt ?? p.createdAt)} · {formatFcfa(p.amount)} · {p.reference}</p>
                    </div>
                    <DocLink href={p.quittanceUrl ?? `/api/pdf/quittance/${p.id}`}>Quittance</DocLink>
                  </li>
                ))}
              </ul>
            )}
          </Group>

          {/* Reçus de paiement d'entrée */}
          <Group title="Reçus de paiement d'entrée" icon={FileText} count={initialReceipts.length}>
            {initialReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun reçu — le paiement d&apos;entrée (caution + avances) génère un reçu archivé ici.</p>
            ) : (
              <ul className="space-y-2">
                {initialReceipts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.confirmedAt ?? p.createdAt)} · {formatFcfa(p.amount)} · {p.reference}</p>
                    </div>
                    <DocLink href={p.receiptUrl ?? `/api/pdf/quittance/${p.id}`}>Reçu</DocLink>
                  </li>
                ))}
              </ul>
            )}
          </Group>

          {/* Reçus de réservations */}
          <Group title="Reçus de réservations" icon={Armchair} count={bookingReceipts.length}>
            {bookingReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune réservation de meublé payée pour le moment.</p>
            ) : (
              <ul className="space-y-2">
                {bookingReceipts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.bookingRef ? `${p.bookingRef} · ` : ""}{formatDate(p.confirmedAt ?? p.createdAt)} · {formatFcfa(p.amount)}</p>
                    </div>
                    <DocLink href={p.receiptUrl ?? `/api/pdf/quittance/${p.id}`}>Reçu</DocLink>
                  </li>
                ))}
              </ul>
            )}
          </Group>

          {/* Factures d'abonnement — non applicable aux locataires */}
          <Group title="Factures d'abonnement" icon={Ban} count={0}>
            <p className="text-sm text-muted-foreground">
              Les factures d&apos;abonnement concernent uniquement les propriétaires (publication d&apos;offres). En tant que locataire, vous n&apos;avez aucun abonnement à régler.
            </p>
          </Group>

          {/* Note sécurité */}
          <section className="rounded-2xl border border-dashed bg-secondary/40 p-4 sm:p-6" aria-label="Sécurité des documents">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold"><Lock className="size-4 text-primary" aria-hidden /> Sécurité &amp; probance</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>• Chaque contrat signé est horodaté et scellé par un hash SHA-256 inaltérable.</li>
              <li>• Les quittances sont générées automatiquement par la plateforme après confirmation du paiement.</li>
              <li>• Seuls vous et votre bailleur pouvez consulter ces documents.</li>
            </ul>
          </section>
        </div>
      )}

      {!loading && !error && myLeases.length === 0 && payments.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Votre coffre-fort est vide"
          description="Contrats, quittances et reçus s'archiveront ici automatiquement dès votre première location."
          actionLabel="Chercher un logement"
          onAction={() => navigate("/recherche")}
        />
      )}
    </div>
  );
}
