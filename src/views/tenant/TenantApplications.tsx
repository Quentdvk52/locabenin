"use client";

// ============================================================
// LocaBénin — Espace Locataire : mes candidatures
// Suivi des candidatures, retrait si en attente, orientation après
// acceptation et lien vers la recherche d'autres offres.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, XCircle, KeyRound, Search, Info, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { navigate } from "@/lib/client/router";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { toast } from "sonner";
import { guardedGet, guardedSend, mutationError } from "./api";

interface RawApplication {
  id: string;
  listingId: string;
  message: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  leaseId: string | null;
  listing: {
    id: string;
    title: string;
    reference: string;
    rentAmount: number;
    rentPeriod: string;
    depositAmount: number;
    advanceMonths: number;
    genre: string;
  };
}

export function TenantApplications() {
  const qc = useQueryClient();

  const apps = useQuery({
    queryKey: ["applications-tenant"],
    queryFn: () => guardedGet<RawApplication[]>("/api/applications"),
  });

  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  async function withdraw(id: string) {
    setWithdrawing(id);
    try {
      await guardedSend("/api/applications", "PATCH", { id, status: "WITHDRAWN" });
      toast.success("Candidature retirée.");
      void qc.invalidateQueries({ queryKey: ["applications-tenant"] });
    } catch (e) {
      toast.error(mutationError(e, "Retrait impossible."));
    } finally {
      setWithdrawing(null);
    }
  }

  const items = apps.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Mes candidatures</h2>
          <p className="text-sm text-muted-foreground">Suivez les réponses des propriétaires sur les logements que vous visez.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/recherche")}>
          <Search className="size-4" aria-hidden /> Chercher d&apos;autres offres
        </Button>
      </div>

      {apps.isLoading && <RowsSkeleton rows={4} />}
      {apps.isError && <ErrorState message="Impossible de charger vos candidatures." onRetry={() => void apps.refetch()} />}

      {!apps.isLoading && !apps.isError && items.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Aucune candidature envoyée"
          description="Trouvez un logement qui vous plaît et candidatez en un clic — vos échanges apparaîtront ici."
          actionLabel="Explorer les offres"
          actionHref="/recherche"
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((a) => (
          <article key={a.id} className="rounded-2xl border bg-card p-4 shadow-soft" aria-label={`Candidature ${a.listing.title}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <button onClick={() => navigate(`/offres/${a.listing.id}`)} className="truncate text-left font-display text-base font-bold hover:text-primary hover:underline">
                  {a.listing.title}
                </button>
                <p className="text-xs text-muted-foreground">
                  {a.listing.reference} · {formatFcfa(a.listing.rentAmount)} / {label(a.listing.rentPeriod)}
                  {a.listing.depositAmount > 0 && ` · caution ${formatFcfa(a.listing.depositAmount)}`}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>

            {a.message && <p className="mt-2 line-clamp-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">« {a.message} »</p>}

            <p className="mt-2 text-xs text-muted-foreground">
              Envoyée le {formatDate(a.createdAt)}{a.decidedAt ? ` · décision le ${formatDate(a.decidedAt)}` : ""}
            </p>

            {a.status === "PENDING" && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] text-destructive hover:text-destructive"
                  disabled={withdrawing === a.id}
                  onClick={() => void withdraw(a.id)}
                >
                  {withdrawing === a.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                  Retirer
                </Button>
              </div>
            )}

            {a.status === "ACCEPTED" && (
              <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                <p className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Le propriétaire prépare votre bail — réglez le paiement d&apos;entrée dès qu&apos;il est créé.
                </p>
                <Button size="sm" className="mt-2 min-h-[40px]" onClick={() => navigate("/locataire/bail")}>
                  <KeyRound className="size-4" aria-hidden /> Aller à mon bail <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            )}

            {(a.status === "REJECTED" || a.status === "WITHDRAWN") && (
              <div className="mt-3">
                <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => navigate("/recherche")}>
                  <Search className="size-4" aria-hidden /> Voir d&apos;autres offres
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
