"use client";

// ============================================================
// LocaBénin — Mes biens & offres (propriétaire)
// Grille avec couverture, badges, compteurs, bascule Démarcheur,
// menu d'actions (modifier / dupliquer / suspendre / reprendre /
// archiver) et filtres locaux par statut.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Building2, Plus, Eye, Heart, MoreVertical, Pencil, Copy, PauseCircle, PlayCircle, Archive, ExternalLink, Crown } from "lucide-react";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { StatusBadge, GenreBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, CardsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { handleApiError } from "./components/helpers";

interface OwnerListing {
  id: string;
  reference: string;
  title: string;
  type: string;
  genre: string;
  category: string;
  status: string;
  rentAmount: number;
  rentPeriod: string;
  dailyPrice: number | null;
  depositAmount: number;
  bedrooms: number;
  bathrooms: number;
  surfaceM2: number | null;
  addressText: string | null;
  areaName: string | null;
  communeName: string | null;
  affiliateEnabled: boolean;
  visitsCount: number;
  favoritesCount: number;
  pendingApplications: number;
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  moderationNote: string | null;
}

const PERIOD_LABEL: Record<string, string> = {
  DAY: "jour", WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre", SEMESTER: "semestre", LEASE: "an",
};

const FILTERS: Array<{ code: string; label: string }> = [
  { code: "ALL", label: "Toutes" },
  { code: "PUBLISHED", label: "Disponibles" },
  { code: "PENDING_REVIEW", label: "En validation" },
  { code: "DRAFT", label: "Brouillons" },
  { code: "RESERVED", label: "Réservées" },
  { code: "RENTED", label: "Louées" },
  { code: "SUSPENDED", label: "Suspendues" },
  { code: "ARCHIVED", label: "Archivées" },
];

function priceLabel(l: OwnerListing): string {
  if (l.genre === "FURNISHED") return `${formatFcfa(l.dailyPrice ?? 0)} / jour`;
  return `${formatFcfa(l.rentAmount)} / ${PERIOD_LABEL[l.rentPeriod] ?? "mois"}`;
}

export default function OwnerListings() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("ALL");

  const { data, isLoading, isError, error, refetch } = useQuery<OwnerListing[]>({
    queryKey: ["owner", "listings"],
    queryFn: () => apiGet<OwnerListing[]>("/api/owner/listings"),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiSend(`/api/owner/listings/${id}`, "PATCH", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["owner", "listings"] });
      void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    },
    onError: (e) => handleApiError(e, "Action impossible."),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "ALL") return data;
    if (filter === "SUSPENDED") return data.filter((l) => l.status === "SUSPENDED_OWNER" || l.status === "SUSPENDED_UNPAID");
    return data.filter((l) => l.status === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: data?.length ?? 0 };
    for (const l of data ?? []) c[l.status] = (c[l.status] ?? 0) + 1;
    c["SUSPENDED"] = (c["SUSPENDED_OWNER"] ?? 0) + (c["SUSPENDED_UNPAID"] ?? 0);
    return c;
  }, [data]);

  function toggleAffiliate(l: OwnerListing, enabled: boolean) {
    patchMutation.mutate(
      { id: l.id, body: { affiliateEnabled: enabled } },
      {
        onSuccess: () => toast.success(enabled ? `Option Démarcheur activée pour « ${l.title} ».` : `Option Démarcheur désactivée pour « ${l.title} ».`),
      },
    );
  }

  function runAction(l: OwnerListing, action: "publish" | "suspend" | "archive" | "duplicate") {
    patchMutation.mutate(
      { id: l.id, body: { action } },
      {
        onSuccess: (res) => {
          if (action === "duplicate") {
            const r = res as { id: string };
            toast.success("Copie créée en brouillon.", { description: "Ouvrez-la pour compléter et publier." });
            navigate(`/proprietaire/biens/${r.id}`);
          } else if (action === "publish") {
            toast.success("Offre envoyée en publication.", { description: "Vous serez notifié dès sa mise en ligne." });
          } else if (action === "suspend") {
            toast.success("Offre suspendue.", { description: "Elle n'est plus visible publiquement." });
          } else {
            toast.success("Offre archivée.", { description: "Retrouvez-la dans l'onglet Archivées." });
          }
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <ViewHeader title="Mes biens & offres" icon={Building2} subtitle="Chargement…" />
        <CardsSkeleton count={6} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState message={error instanceof Error ? error.message : "Impossible de charger vos offres."} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Mes biens & offres"
        subtitle={`${data.length} offre(s) — tous statuts et options`}
        icon={Building2}
        action={
          <Button onClick={() => navigate("/proprietaire/biens/nouveau")} className="h-11">
            <Plus className="size-4" aria-hidden /> Publier une offre
          </Button>
        }
      />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.code} value={f.code} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {f.label}
              {counts[f.code] ? <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px] font-bold dark:bg-white/10">{counts[f.code]}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          title={filter === "ALL" ? "Aucune offre pour le moment" : "Aucune offre dans ce filtre"}
          description="Publiez votre premier bien : visites, candidatures, bail et paiements en ligne, le tout au même endroit."
          actionLabel="Publier une offre"
          onAction={() => navigate("/proprietaire/biens/nouveau")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((l) => (
            <article key={l.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft">
              <button
                type="button"
                onClick={() => (l.status === "PUBLISHED" ? navigate(`/offres/${l.id}`) : navigate(`/proprietaire/biens/${l.id}`))}
                className="group relative block aspect-[16/9] w-full overflow-hidden bg-secondary"
                aria-label={`Ouvrir « ${l.title} »`}
              >
                {l.coverUrl ? (
                  <img src={l.coverUrl} alt={`Photo de ${l.title}`} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground"><Building2 className="size-10" aria-hidden /></span>
                )}
                <span className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={l.status} className="bg-background/90 backdrop-blur" />
                  <GenreBadge genre={l.genre} className="bg-background/90 backdrop-blur" />
                </span>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">{l.reference}</span>
              </button>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-bold">{l.title}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.areaName, l.communeName].filter(Boolean).join(", ") || l.addressText || "Adresse non précisée"}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Actions pour « ${l.title} »`}>
                        <MoreVertical className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => navigate(`/proprietaire/biens/${l.id}`)}>
                        <Pencil className="size-4" aria-hidden /> Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => runAction(l, "duplicate")}>
                        <Copy className="size-4" aria-hidden /> Dupliquer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {["DRAFT", "SUSPENDED_OWNER", "SUSPENDED_UNPAID", "ARCHIVED"].includes(l.status) ? (
                        <DropdownMenuItem onClick={() => runAction(l, "publish")}>
                          <PlayCircle className="size-4" aria-hidden /> Reprendre / publier
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => runAction(l, "suspend")}>
                          <PauseCircle className="size-4" aria-hidden /> Suspendre
                        </DropdownMenuItem>
                      )}
                      {l.status !== "ARCHIVED" && (
                        <DropdownMenuItem onClick={() => runAction(l, "archive")} className="text-red-600 focus:text-red-600">
                          <Archive className="size-4" aria-hidden /> Archiver
                        </DropdownMenuItem>
                      )}
                      {l.status === "PUBLISHED" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigate(`/offres/${l.id}`)}>
                            <ExternalLink className="size-4" aria-hidden /> Voir l&apos;annonce
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="font-display text-lg font-bold text-primary">{priceLabel(l)}</p>
                <p className="text-xs text-muted-foreground">
                  {l.bedrooms >= 0 ? `${l.bedrooms} chambre(s)` : "Chambre-salon"} · {l.bathrooms} douche(s)
                  {l.surfaceM2 ? ` · ${l.surfaceM2} m²` : ""}
                </p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden /> {l.visitsCount}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden /> {l.favoritesCount}</span>
                    {l.pendingApplications > 0 && (
                      <button className="font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={() => navigate("/proprietaire/visites")}>
                        {l.pendingApplications} candidature(s)
                      </button>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Crown className="size-3.5 text-violet-600 dark:text-violet-400" aria-hidden />
                    <span className="hidden sm:inline">Démarcheur</span>
                    <Switch
                      checked={l.affiliateEnabled}
                      onCheckedChange={(v) => toggleAffiliate(l, v)}
                      disabled={patchMutation.isPending}
                      aria-label={`Option démarcheur pour ${l.title}`}
                    />
                  </label>
                </div>
                {l.moderationNote && (l.status === "DRAFT" || l.status === "PENDING_REVIEW") && (
                  <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-400">
                    Note de modération : {l.moderationNote}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
