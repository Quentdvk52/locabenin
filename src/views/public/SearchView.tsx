"use client";

// ============================================================
// LocaBénin — Vue Recherche
// Filtres synchronisés avec l'URL (partageables), panneau latéral
// desktop / tiroir bas mobile, chips actifs, compteur en direct,
// sauvegarde de la recherche et fil infini keyset.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, BookmarkPlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InfiniteListings, type CursorPage } from "@/components/shared/cursor-list";
import { useSession, apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { buildSearchUrl, navigate, useRoute } from "@/lib/client/router";
import { LISTING_TYPES, label } from "@/lib/constants";
import { toast } from "sonner";
import { FiltersPanel, useGeo, type Filters } from "./components/FiltersPanel";
import { cn } from "@/lib/utils";

const TYPE_PLURAL: Record<string, string> = {
  APARTMENT: "Appartements",
  HOUSE: "Maisons",
  VILLA: "Villas",
  OFFICE: "Bureaux",
  GARAGE: "Garages",
  LAND: "Terrains",
  FIELD: "Champs",
  ESTATE: "Propriétés",
  SHOP: "Boutiques",
};

const FEATURE_LABELS: Record<string, string> = {
  studio: "Studio",
  "chambre-salon": "Chambre-salon",
  "deux-chambres-salon": "2 chambres-salon",
  "3plus": "3 chambres et +",
};

function csvList(csv?: string): string[] {
  return csv ? csv.split(",").filter(Boolean) : [];
}

function removeFromCsv(csv: string, code: string): string | undefined {
  const next = csvList(csv).filter((c) => c !== code);
  return next.length ? next.join(",") : undefined;
}

function formatShortFcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(n).replace(/\u202F|\u00A0/g, " ")} F`;
}

export default function SearchView() {
  const route = useRoute();
  const query = route.query;
  const { user } = useSession();
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----- Filtres = état de l'URL -----
  const filters: Filters = useMemo(
    () => ({
      q: query.q ?? "",
      type: query.type ?? "",
      feature: query.feature ?? "",
      genre: query.genre ?? "",
      min: query.min ?? "",
      max: query.max ?? "",
      period: query.period ?? "",
      dept: query.dept ?? "",
      commune: query.commune ?? "",
      area: query.area ?? "",
      amenities: query.amenities ?? "",
      sort: query.sort ?? "",
      demoCity: query.demoCity ?? "",
    }),
    [query],
  );

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  const patch = (p: Record<string, string | undefined>) => {
    const merged: Record<string, string | number | undefined | null> = { ...filters, ...p };
    // demoCity est un filtre SEO de la landing : toute modification manuelle le retire.
    if (!("demoCity" in p)) merged.demoCity = filters.demoCity || undefined;
    navigate(buildSearchUrl(merged, "/recherche"), { replace: true, keepScroll: true });
  };

  const reset = () => navigate("/recherche", { replace: true, keepScroll: true });

  // ----- Endpoint des résultats -----
  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/api/public/listings?${qs}${qs ? "&" : ""}limit=12`;
  }, [filters]);

  // Compteur léger (page de 1 → on ne lit que `total`)
  const { data: countPage, isFetching: countFetching } = useQuery({
    queryKey: ["search-total", endpoint],
    queryFn: () => apiGet<CursorPage>(`${endpoint}&limit=1`),
    staleTime: 15_000,
  });
  const total = countPage?.total ?? 0;

  // ----- Titre dynamique -----
  const { data: departments } = useGeo();
  const title = useMemo(() => {
    const types = csvList(filters.type);
    let what: string;
    if (types.length === 1) {
      what = TYPE_PLURAL[types[0]] ?? label(types[0]);
      if (filters.genre === "FURNISHED") what = `${what} meublé${what.endsWith("s") ? "s" : ""}`;
    } else if (types.length > 1) {
      what = "Biens";
    } else {
      what = filters.genre === "FURNISHED" ? "Meublés" : "Biens";
    }
    const dept = departments?.find((d) => d.code === filters.dept);
    const communeName = filters.demoCity
      ? filters.demoCity.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())
      : dept?.communes.find((c) => c.id === filters.commune)?.name;
    const areaName = communeName ? dept?.communes.find((c) => c.id === filters.commune)?.areas.find((a) => a.id === filters.area)?.name : undefined;
    const where = areaName ?? communeName ?? dept?.name;
    return `${what} à louer${where ? ` à ${where}` : " au Bénin"}`;
  }, [filters, departments]);

  // ----- Chips de filtres actifs -----
  const chips = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.q) out.push({ key: "q", label: `« ${filters.q} »`, clear: () => patch({ q: undefined }) });
    for (const t of csvList(filters.type)) out.push({ key: `type:${t}`, label: label(t), clear: () => patch({ type: removeFromCsv(filters.type, t) }) });
    if (filters.feature) out.push({ key: "feature", label: FEATURE_LABELS[filters.feature] ?? filters.feature, clear: () => patch({ feature: undefined }) });
    if (filters.genre) out.push({ key: "genre", label: filters.genre === "FURNISHED" ? "Meublé" : "Location simple", clear: () => patch({ genre: undefined }) });
    if (filters.min) out.push({ key: "min", label: `Min : ${formatShortFcfa(Number(filters.min))}`, clear: () => patch({ min: undefined }) });
    if (filters.max) out.push({ key: "max", label: `Max : ${formatShortFcfa(Number(filters.max))}`, clear: () => patch({ max: undefined }) });
    for (const p of csvList(filters.period)) out.push({ key: `period:${p}`, label: `par ${label(p)}`, clear: () => patch({ period: removeFromCsv(filters.period, p) }) });
    if (filters.dept) out.push({ key: "dept", label: departments?.find((d) => d.code === filters.dept)?.name ?? "Département", clear: () => patch({ dept: undefined, commune: undefined, area: undefined }) });
    if (filters.commune) {
      const name = departments?.find((d) => d.code === filters.dept)?.communes.find((c) => c.id === filters.commune)?.name;
      out.push({ key: "commune", label: name ?? "Commune", clear: () => patch({ commune: undefined, area: undefined }) });
    }
    if (filters.area) {
      const name = departments?.find((d) => d.code === filters.dept)?.communes.find((c) => c.id === filters.commune)?.areas.find((a) => a.id === filters.area)?.name;
      out.push({ key: "area", label: name ?? "Quartier", clear: () => patch({ area: undefined }) });
    }
    for (const a of csvList(filters.amenities)) out.push({ key: `am:${a}`, label: label(a), clear: () => patch({ amenities: removeFromCsv(filters.amenities, a) }) });
    if (filters.demoCity) out.push({ key: "demoCity", label: filters.demoCity.replace(/-/g, " "), clear: () => patch({ demoCity: undefined }) });
    return out;
  }, [filters, departments, patch]);

  // ----- Sauvegarde de la recherche -----
  async function saveSearch() {
    if (!user) {
      toast.info("Connectez-vous pour enregistrer cette recherche et recevoir des alertes.");
      navigate("/connexion");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const filterObject: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters)) if (v) filterObject[k] = v;
      await apiSend("/api/me/saved-searches", "POST", { name: title, filters: filterObject, alertsEnabled: true });
      toast.success("Recherche enregistrée — vous serez alerté des nouvelles offres correspondantes.");
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) navigate("/connexion");
      else toast.error(e instanceof ApiClientError ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 pb-28 md:pb-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
            {countFetching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {total} offre{total !== 1 ? "s" : ""} correspond{total !== 1 ? "ent" : ""} à votre recherche
          </p>
        </div>
        <Button variant="outline" onClick={() => void saveSearch()} disabled={saving} className="shrink-0">
          <BookmarkPlus className="mr-2 size-4" aria-hidden />
          Enregistrer cette recherche
        </Button>
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[290px_1fr] lg:gap-7">
        {/* Panneau latéral desktop */}
        <aside className="hidden lg:block" aria-label="Filtres de recherche">
          <div className="styled-scroll sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border bg-card p-4 pr-2.5 shadow-soft">
            <FiltersPanel filters={filters} patch={patch} reset={reset} />
          </div>
        </aside>

        {/* Résultats */}
        <div className="min-w-0">
          {/* Barre mobile : bouton filtres + chips actifs défilants */}
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="shrink-0" aria-haspopup="dialog">
                  <SlidersHorizontal className="mr-2 size-4" aria-hidden />
                  Filtres
                  {hasActiveFilters && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{chips.length}</span>}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="flex max-h-[85vh] flex-col p-0">
                <SheetHeader className="border-b px-4 py-3">
                  <SheetTitle className="font-display">Filtres de recherche</SheetTitle>
                </SheetHeader>
                <div className="styled-scroll flex-1 overflow-y-auto px-4 py-4">
                  <FiltersPanel filters={filters} patch={patch} reset={reset} />
                </div>
                <div className="border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  <Button className="w-full" onClick={() => setSheetOpen(false)}>
                    Voir les {total} offre{total !== 1 ? "s" : ""}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
              {chips.length === 0 ? (
                <span className="whitespace-nowrap px-1 py-2 text-xs text-muted-foreground">Aucun filtre actif — affinez votre recherche.</span>
              ) : (
                chips.map((c) => <ActiveChip key={c.key} label={c.label} onClear={c.clear} />)
              )}
            </div>
          </div>

          {/* Chips actifs desktop */}
          {chips.length > 0 && (
            <div className="mt-0 hidden flex-wrap items-center gap-1.5 lg:flex">
              {chips.map((c) => <ActiveChip key={c.key} label={c.label} onClear={c.clear} />)}
              <button onClick={reset} className="ml-1 text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80">
                Tout effacer
              </button>
            </div>
          )}
          {chips.length > 0 && <div className="hidden lg:mt-3 lg:block" aria-hidden />}

          <div className="mt-4 lg:mt-0">
            <InfiniteListings
              endpoint={endpoint}
              emptyTitle="Aucune offre ne correspond à ces critères"
              emptyDescription="Essayez d'élargir votre budget, de retirer un filtre ou de changer de quartier."
              emptyAction={{ label: "Tout effacer et recommencer", href: "/recherche" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveChip({ label: text, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className={cn("inline-flex max-w-[220px] shrink-0 items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-xs font-medium shadow-soft")}>
      <span className="truncate">{text}</span>
      <button
        onClick={onClear}
        aria-label={`Retirer le filtre ${text}`}
        className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}
