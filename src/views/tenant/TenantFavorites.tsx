"use client";

// ============================================================
// LocaBénin — Espace Locataire : Favoris & recherches sauvegardées
// Route « /favoris » (routée vers ce module par la coquille).
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Search, Bell, Trash2, Play, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, CardsSkeleton, RowsSkeleton } from "@/components/shared/states";
import { ListingCard } from "@/components/shared/listing-card";
import { navigate } from "@/lib/client/router";
import { formatDate } from "@/lib/finance";
import { toast } from "sonner";
import { guardedGet, guardedSend, toCardData, mutationError, type RawListing } from "./api";

interface SavedSearch {
  id: string;
  name: string;
  filtersJson: string;
  alertsEnabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

/** Reconstitue la querystring de recherche depuis les filtres sauvegardés. */
function searchUrlFromFilters(filtersJson: string): string {
  let filters: Record<string, unknown> = {};
  try {
    filters = JSON.parse(filtersJson) as Record<string, unknown>;
  } catch {
    return "/recherche";
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(k, v.map(String).join(","));
      continue;
    }
    if (typeof v === "boolean") {
      if (v) params.set(k, "1");
      continue;
    }
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `/recherche?${qs}` : "/recherche";
}

export function TenantFavorites() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => guardedGet<RawListing[]>("/api/me/favorites"),
  });

  const saved = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => guardedGet<SavedSearch[]>("/api/me/saved-searches"),
  });

  async function deleteSaved(id: string) {
    setBusyId(id);
    try {
      await guardedSend("/api/me/saved-searches", "DELETE", { id });
      toast.success("Recherche supprimée.");
      void qc.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch (e) {
      toast.error(mutationError(e, "Suppression impossible."));
    } finally {
      setBusyId(null);
    }
  }

  /** Bascule des alertes : l'API n'expose pas de PATCH → recréation avec l'état inversé. */
  async function toggleAlerts(sr: SavedSearch) {
    setBusyId(sr.id);
    try {
      const filters = JSON.parse(sr.filtersJson) as Record<string, unknown>;
      await guardedSend("/api/me/saved-searches", "POST", { name: sr.name, filters, alertsEnabled: !sr.alertsEnabled });
      await guardedSend("/api/me/saved-searches", "DELETE", { id: sr.id });
      toast.success(sr.alertsEnabled ? "Alertes désactivées pour cette recherche." : "Alertes activées : vous serez notifié des nouvelles offres.");
      void qc.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch (e) {
      toast.error(mutationError(e, "Bascule impossible."));
    } finally {
      setBusyId(null);
    }
  }

  function launch(sr: SavedSearch) {
    navigate(searchUrlFromFilters(sr.filtersJson));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Favoris &amp; recherches</h2>
        <p className="text-sm text-muted-foreground">Retrouvez les offres qui vous plaisent et vos recherches enregistrées avec alertes.</p>
      </div>

      <Tabs defaultValue="favorites">
        <TabsList className="h-11 w-full sm:w-auto">
          <TabsTrigger value="favorites" className="gap-2 px-4"><Heart className="size-4" aria-hidden /> Favoris</TabsTrigger>
          <TabsTrigger value="searches" className="gap-2 px-4"><Search className="size-4" aria-hidden /> Recherches sauvegardées</TabsTrigger>
        </TabsList>

        <TabsContent value="favorites" className="mt-4">
          {favorites.isLoading && <CardsSkeleton count={3} />}
          {favorites.isError && <ErrorState message="Impossible de charger vos favoris." onRetry={() => void favorites.refetch()} />}
          {favorites.data && favorites.data.length === 0 && (
            <EmptyState
              icon={Heart}
              title="Aucun favori pour l'instant"
              description="Parcourez les offres et touchez le cœur pour les retrouver ici — et être alerté des changements de prix."
              actionLabel="Explorer les offres"
              actionHref="/recherche"
            />
          )}
          {favorites.data && favorites.data.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.data.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={toCardData(l)}
                  onFavoriteToggle={() => { void qc.invalidateQueries({ queryKey: ["favorites"] }); }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="searches" className="mt-4">
          {saved.isLoading && <RowsSkeleton rows={3} />}
          {saved.isError && <ErrorState message="Impossible de charger vos recherches." onRetry={() => void saved.refetch()} />}
          {saved.data && saved.data.length === 0 && (
            <EmptyState
              icon={Save}
              title="Aucune recherche sauvegardée"
              description="Effectuez une recherche puis cliquez sur « Sauvegarder » pour recevoir des alertes quand de nouvelles offres correspondent."
              actionLabel="Faire une recherche"
              actionHref="/recherche"
            />
          )}
          {saved.data && saved.data.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {saved.data.map((sr) => (
                <article key={sr.id} className="rounded-2xl border bg-card p-4 shadow-soft" aria-label={`Recherche ${sr.name}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-bold">{sr.name}</h3>
                      <p className="text-xs text-muted-foreground">Créée le {formatDate(sr.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2" aria-label="Alertes">
                      <Bell className={sr.alertsEnabled ? "size-4 text-primary" : "size-4 text-muted-foreground"} aria-hidden />
                      <Switch
                        checked={sr.alertsEnabled}
                        disabled={busyId === sr.id}
                        onCheckedChange={() => void toggleAlerts(sr)}
                        aria-label={sr.alertsEnabled ? "Désactiver les alertes" : "Activer les alertes"}
                      />
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{searchUrlFromFilters(sr.filtersJson).replace("/recherche?", "") || "Toutes les offres"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" className="min-h-[44px] flex-1" disabled={busyId === sr.id} onClick={() => launch(sr)}>
                      <Play className="size-4" aria-hidden /> Lancer la recherche
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px] text-destructive hover:text-destructive"
                      disabled={busyId === sr.id}
                      onClick={() => void deleteSaved(sr.id)}
                      aria-label={`Supprimer la recherche ${sr.name}`}
                    >
                      {busyId === sr.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                      Supprimer
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
