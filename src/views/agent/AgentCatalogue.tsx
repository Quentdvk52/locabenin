"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : catalogue des offres affiliables
// Offres PUBLISHED avec l'option « Démarcheur » activée, commission
// estimée, génération du lien en un clic, filtres locaux.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Search, Link2, Loader2, ExternalLink, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, CardsSkeleton, EmptyState } from "@/components/shared/states";
import { ListingCard, type ListingCardData } from "@/components/shared/listing-card";
import { navigate } from "@/lib/client/router";
import { formatFcfa, computeCommission } from "@/lib/finance";
import { toast } from "sonner";
import { guardedGet, guardedSend, mutationError, type AgentData } from "./api";

interface PublicItem {
  id: string;
  reference: string;
  title: string;
  type: string;
  genre: string;
  status: string;
  rentAmount: number;
  rentPeriod: string;
  dailyPrice: number | null;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  depositAmount: number;
  bedrooms: number;
  bathrooms: number;
  surfaceM2: number | null;
  areaName: string | null;
  communeName: string | null;
  isFeatured: boolean;
  affiliateEnabled: boolean;
  coverUrl: string | null;
  photos: Array<{ url: string; thumbUrl?: string | null }>;
  isFavorite: boolean;
  commissionAmount: number | null;
}

/** Page de listings publics (jusqu'à 3 pages pour couvrir les affiliations). */
async function fetchAffiliatePage(): Promise<PublicItem[]> {
  let cursor: string | null = null;
  const collected: PublicItem[] = [];
  for (let page = 0; page < 3; page++) {
    const qs = new URLSearchParams({ limit: "24" });
    if (cursor) qs.set("cursor", cursor);
    const res = await guardedGet<{ items: PublicItem[]; nextCursor: string | null }>(`/api/public/listings?${qs.toString()}`);
    collected.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return collected;
}

export function AgentCatalogue() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("recent");
  const [creating, setCreating] = useState<string | null>(null);

  const listings = useQuery({
    queryKey: ["agent-catalogue"],
    queryFn: fetchAffiliatePage,
  });

  const agent = useQuery({
    queryKey: ["agent"],
    queryFn: () => guardedGet<AgentData>("/api/agent"),
  });

  const myListingIds = useMemo(() => new Set((agent.data?.links ?? []).map((l) => l.listingId)), [agent.data]);

  // Uniquement les offres affiliables + filtres locaux
  const items = useMemo(() => {
    let list = (listings.data ?? []).filter((l) => l.affiliateEnabled);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) =>
        [l.title, l.reference, l.areaName, l.communeName].filter(Boolean).some((s) => (s as string).toLowerCase().includes(q)),
      );
    }
    const priceOf = (l: PublicItem) => l.dailyPrice ?? l.rentAmount;
    if (sort === "price_asc") list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    if (sort === "price_desc") list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
    return list;
  }, [listings.data, search, sort]);

  function toCard(l: PublicItem): ListingCardData {
    return {
      id: l.id,
      reference: l.reference,
      title: l.title,
      type: l.type,
      genre: l.genre,
      status: l.status,
      rentAmount: l.rentAmount,
      rentPeriod: l.rentPeriod,
      dailyPrice: l.dailyPrice,
      weeklyPrice: l.weeklyPrice,
      monthlyPrice: l.monthlyPrice,
      depositAmount: l.depositAmount,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      surfaceM2: l.surfaceM2,
      areaName: l.areaName,
      communeName: l.communeName,
      isFeatured: l.isFeatured,
      affiliateEnabled: l.affiliateEnabled,
      coverUrl: l.coverUrl,
      photos: l.photos,
      isFavorite: l.isFavorite,
      // Complète la commission serveur (absente hors rôle AGENT actif)
      commissionAmount: l.commissionAmount ?? computeCommission(l.rentAmount).total,
    };
  }

  async function getLink(listingId: string) {
    setCreating(listingId);
    try {
      const res = await guardedSend<{ created: boolean; estimatedCommission?: number }>("/api/agent", "POST", { listingId });
      if (res.created) {
        toast.success("Votre lien de démarcheur est prêt ! Retrouvez-le dans « Mes liens & QR ».");
      } else {
        toast.info("Vous avez déjà un lien sur cette offre.");
      }
      void qc.invalidateQueries({ queryKey: ["agent"] });
    } catch (e) {
      toast.error(mutationError(e, "Création du lien impossible."));
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Catalogue affiliable</h2>
        <p className="mt-1 flex items-start gap-2 rounded-xl border bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Seules les offres activées « Démarcheur » par leurs propriétaires sont affiliables. Commission : ½ mois de loyer
            (25 % locataire + 25 % propriétaire), créditée à la confirmation du paiement d&apos;entrée.
            Meublés &lt; 1 mois : pas de commission (règle par défaut).
          </span>
        </p>
      </div>

      {/* Filtres locaux */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre, quartier, référence…"
            className="pl-9"
            aria-label="Rechercher dans le catalogue"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Trier les offres">
            <SelectValue placeholder="Trier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Plus récentes</SelectItem>
            <SelectItem value="price_asc">Prix croissant</SelectItem>
            <SelectItem value="price_desc">Prix décroissant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listings.isLoading && <CardsSkeleton count={6} />}
      {listings.isError && <ErrorState message="Impossible de charger le catalogue." onRetry={() => void listings.refetch()} />}

      {!listings.isLoading && !listings.isError && items.length === 0 && (
        <EmptyState
          icon={Crown}
          title="Aucune offre affiliable pour l'instant"
          description={search ? "Aucune offre ne correspond à votre recherche." : "Les propriétaires activent l'option « Démarcheur » sur leurs annonces — revenez bientôt, le catalogue grandit chaque jour."}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((l) => {
          const hasLink = myListingIds.has(l.id);
          const commission = l.commissionAmount ?? computeCommission(l.rentAmount).total;
          return (
            <div key={l.id} className="flex flex-col gap-2">
              <ListingCard listing={toCard(l)} showAgentBadge />
              <div className="flex items-center justify-between gap-2 rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-950/40">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                  Commission estimée : {formatFcfa(commission)}
                  {l.genre === "FURNISHED" && <span className="block text-[10px] font-normal">(selon durée du séjour)</span>}
                </p>
                {hasLink ? (
                  <Button size="sm" variant="outline" className="min-h-[40px] shrink-0 border-violet-300 text-violet-700 hover:bg-violet-100 dark:text-violet-300" onClick={() => navigate("/demarcheur/liens")}>
                    <ExternalLink className="size-4" aria-hidden /> Voir mon lien
                  </Button>
                ) : (
                  <Button size="sm" className="min-h-[40px] shrink-0" disabled={creating === l.id} onClick={() => void getLink(l.id)}>
                    {creating === l.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
                    Obtenir mon lien
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {agent.isFetching && !agent.isLoading && (
        <p className="text-center text-xs text-muted-foreground">Synchronisation de vos liens…</p>
      )}
    </div>
  );
}
