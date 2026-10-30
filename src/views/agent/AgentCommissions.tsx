"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : mes commissions
// Cycle de validation anti-fraude : Créée → PENDING_VALIDATION
// (retirable le …) → VALIDATED → PAID. Détail des parts.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldCheck, Info } from "lucide-react";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { Timeline } from "@/components/shared/form-bits";
import { formatFcfa, formatDate } from "@/lib/finance";
import { guardedGet, type AgentData, type AgentCommissionItem } from "./api";

function timelineFor(c: AgentCommissionItem, validationDays: number) {
  const pendingNow = c.status === "PENDING_VALIDATION";
  const validatedNow = c.status === "VALIDATED";
  const cancelled = c.status === "CANCELLED";
  return [
    {
      title: "Commission créée",
      description: "Créditée à la confirmation du paiement d'entrée du locataire.",
      time: formatDate(c.createdAt, true),
      state: "done" as const,
    },
    {
      title: "En validation anti-fraude",
      description: pendingNow ? `Retirable le ${formatDate(c.validatableAt)} (${validationDays} jours)` : "Période de vérification terminée",
      time: undefined,
      state: pendingNow ? ("current" as const) : ("done" as const),
    },
    {
      title: "Validée",
      description: validatedNow ? "Disponible dans votre portefeuille" : undefined,
      time: c.validatedAt ? formatDate(c.validatedAt, true) : undefined,
      state: validatedNow ? ("current" as const) : c.validatedAt ? ("done" as const) : ("pending" as const),
    },
    {
      title: "Payée",
      description: c.paidAt ? `Versée le ${formatDate(c.paidAt)}` : "Via Mobile Money après retrait",
      time: undefined,
      state: c.paidAt ? ("done" as const) : ("pending" as const),
    },
    ...(cancelled ? [{ title: "Annulée", description: "Commission annulée par l'administration", state: "current" as const }] : []),
  ];
}

export function AgentCommissions() {
  const data = useQuery({
    queryKey: ["agent"],
    queryFn: () => guardedGet<AgentData>("/api/agent"),
  });

  if (data.isLoading) {
    return (
      <div className="mx-auto max-w-7xl"><RowsSkeleton rows={4} /></div>
    );
  }
  if (data.isError || !data.data) {
    return (
      <div className="mx-auto max-w-7xl"><ErrorState message="Impossible de charger vos commissions." onRetry={() => void data.refetch()} /></div>
    );
  }

  const { commissions, settings } = data.data;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Mes commissions</h2>
        <p className="text-sm text-muted-foreground">
          {commissions.length} commission(s) au total — parts {settings.commissionTenantSharePct} % locataire + {settings.commissionOwnerSharePct} % propriétaire.
        </p>
      </div>

      {/* Explication du cycle anti-fraude */}
      <section className="flex items-start gap-2.5 rounded-2xl border border-dashed bg-secondary/40 p-4" aria-label="Cycle de validation">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Cycle de validation anti-fraude</p>
          <p className="mt-1">
            Chaque commission reste <strong className="text-foreground">{settings.commissionValidationDays} jours</strong> en validation
            (défaut paramétrable par l&apos;administration) : cela protège contre les annulations, litiges et fraudes au
            paiement. Passé ce délai, elle devient <strong className="text-foreground">validée</strong> puis
            <strong className="text-foreground"> payée</strong> lors de votre retrait Mobile Money.
          </p>
        </div>
      </section>

      {commissions.length === 0 && (
        <EmptyState
          icon={BadgeCheck}
          title="Aucune commission pour l'instant"
          description="Une commission est créée automatiquement quand un locataire venant de votre lien confirme son paiement d'entrée."
          actionLabel="Voir le catalogue affiliable"
          actionHref="/demarcheur/catalogue"
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {commissions.map((c) => (
          <article key={c.id} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5" aria-label={`Commission ${c.listingTitle}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-bold">{c.listingTitle}</h3>
                <p className="text-xs text-muted-foreground">
                  {c.leaseRef ? `Bail ${c.leaseRef}` : "Location via votre lien"} · créée le {formatDate(c.createdAt)}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary/50 p-3 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Locataire</p>
                <p className="text-sm font-bold">{formatFcfa(c.tenantShare)}</p>
              </div>
              <div className="border-x">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Propriétaire</p>
                <p className="text-sm font-bold">{formatFcfa(c.ownerShare)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-sm font-bold text-primary">{formatFcfa(c.total)}</p>
              </div>
            </div>

            <div className="mt-4">
              <Timeline items={timelineFor(c, settings.commissionValidationDays)} />
            </div>

            {c.status === "PENDING_VALIDATION" && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5" aria-hidden />
                Retirable à partir du {formatDate(c.validatableAt)}.
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
