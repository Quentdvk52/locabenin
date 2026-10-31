"use client";

// ============================================================
// LocaBénin — Panneau de filtres de recherche (réutilisable)
// Employé dans le panneau latéral desktop ET le tiroir bas mobile
// de la vue Recherche. L'état vit dans l'URL (via `patch`).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/shared/form-bits";
import { AMENITIES, LISTING_TYPES, RENT_PERIODS, label } from "@/lib/constants";
import { apiGet } from "@/lib/client/session";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

// ---------- Référentiel géographique ----------

export interface GeoArea {
  id: string;
  name: string;
}
export interface GeoCommune {
  id: string;
  name: string;
  areas: GeoArea[];
}
export interface GeoDepartment {
  id: string;
  code: string;
  name: string;
  communes: GeoCommune[];
}

export function useGeo() {
  return useQuery({
    queryKey: ["public-geo"],
    queryFn: () => apiGet<GeoDepartment[]>("/api/public/geo"),
    staleTime: 10 * 60_000,
  });
}

export type Filters = Record<string, string>;
export type PatchFn = (patch: Record<string, string | undefined>) => void;

const FEATURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "studio", label: "Studio" },
  { value: "chambre-salon", label: "Chambre-salon" },
  { value: "deux-chambres-salon", label: "2 chambres-salon" },
  { value: "3plus", label: "3 chambres et +" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "recent", label: "Plus récentes" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "popular", label: "Les plus populaires" },
];

function toCsvList(csv?: string): string[] {
  return csv ? csv.split(",").filter(Boolean) : [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-b pb-4 last:border-b-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function FiltersPanel({ filters, patch, reset }: { filters: Filters; patch: PatchFn; reset: () => void }) {
  const { data: departments } = useGeo();
  const selectedTypes = toCsvList(filters.type);
  const selectedPeriods = toCsvList(filters.period);
  const selectedAmenities = toCsvList(filters.amenities);

  // Département / commune / quartier (sélection en cascade)
  const dept = departments?.find((d) => d.code === filters.dept) ?? null;
  const commune = dept?.communes.find((c) => c.id === filters.commune) ?? null;

  // Budget : brouillon local + commit débouncé dans l'URL (évite un fetch par touche).
  // L'URL reste la source de vérité : tant que `draft` est null, on affiche l'URL ;
  // en cours de frappe, on affiche le brouillon puis on le rend à l'URL après commit.
  const [draft, setDraft] = useState<{ min: number | ""; max: number | "" } | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (commitTimer.current) clearTimeout(commitTimer.current); }, []);

  const urlMin = filters.min ? Number(filters.min) : "";
  const urlMax = filters.max ? Number(filters.max) : "";
  const shownMin = draft ? draft.min : urlMin;
  const shownMax = draft ? draft.max : urlMax;

  function updateBudget(partial: { min?: number | ""; max?: number | "" }) {
    const next = { min: partial.min ?? (draft ? draft.min : urlMin), max: partial.max ?? (draft ? draft.max : urlMax) };
    setDraft(next);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      patch({
        min: next.min === "" ? undefined : String(next.min),
        max: next.max === "" ? undefined : String(next.max),
      });
      setDraft(null);
    }, 600);
  }

  function toggleIn(field: "type" | "period" | "amenities", code: string) {
    const list = toCsvList(filters[field]);
    const next = list.includes(code) ? list.filter((c) => c !== code) : [...list, code];
    patch({ [field]: next.length ? next.join(",") : undefined });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Filtres</h2>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden /> Tout effacer
        </Button>
      </div>

      <Section title="Mot-clé">
        <Input
          value={filters.q ?? ""}
          onChange={(e) => patch({ q: e.target.value || undefined })}
          placeholder="Quartier, titre, référence…"
          aria-label="Mot-clé"
        />
      </Section>

      <Section title="Type de bien">
        <div className="grid grid-cols-1 gap-2">
          {LISTING_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2.5 text-sm font-normal">
              <Checkbox checked={selectedTypes.includes(t)} onCheckedChange={() => toggleIn("type", t)} aria-label={label(t)} />
              {label(t)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Caractéristique">
        <Select value={filters.feature ?? "all"} onValueChange={(v) => patch({ feature: v === "all" ? undefined : v })}>
          <SelectTrigger aria-label="Caractéristique"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes configurations</SelectItem>
            {FEATURE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Type de location">
        <Select value={filters.genre ?? "all"} onValueChange={(v) => patch({ genre: v === "all" ? undefined : v })}>
          <SelectTrigger aria-label="Type de location"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="SIMPLE">Location simple</SelectItem>
            <SelectItem value="FURNISHED">Meublé</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Budget (FCFA)">
        <div className="flex items-center gap-2">
          <MoneyInput value={shownMin} onChange={(v) => updateBudget({ min: v === 0 ? "" : v })} placeholder="Min" ariaLabel="Budget minimum" className="flex-1" />
          <span className="text-xs text-muted-foreground" aria-hidden>→</span>
          <MoneyInput value={shownMax} onChange={(v) => updateBudget({ max: v === 0 ? "" : v })} placeholder="Max" ariaLabel="Budget maximum" className="flex-1" />
        </div>
      </Section>

      <Section title="Période de paiement">
        <div className="flex flex-wrap gap-1.5">
          {RENT_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleIn("period", p)}
              aria-pressed={selectedPeriods.includes(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                selectedPeriods.includes(p) ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
              )}
            >
              par {label(p)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Localisation">
        <div className="space-y-2">
          <Select
            value={filters.dept ?? "all"}
            onValueChange={(v) => patch({ dept: v === "all" ? undefined : v, commune: undefined, area: undefined })}
          >
            <SelectTrigger aria-label="Département"><SelectValue placeholder="Département" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tout le Bénin</SelectItem>
              {(departments ?? []).map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {dept && (
            <Select
              value={filters.commune ?? "all"}
              onValueChange={(v) => patch({ commune: v === "all" ? undefined : v, area: undefined })}
            >
              <SelectTrigger aria-label="Commune"><SelectValue placeholder="Commune" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les communes</SelectItem>
                {dept.communes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {commune && commune.areas.length > 0 && (
            <Select value={filters.area ?? "all"} onValueChange={(v) => patch({ area: v === "all" ? undefined : v })}>
              <SelectTrigger aria-label="Quartier"><SelectValue placeholder="Quartier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les quartiers</SelectItem>
                {commune.areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </Section>

      <Section title="Équipements">
        <div className="flex flex-wrap gap-1.5">
          {AMENITIES.map((a) => (
            <button
              key={a.code}
              type="button"
              onClick={() => toggleIn("amenities", a.code)}
              aria-pressed={selectedAmenities.includes(a.code)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                selectedAmenities.includes(a.code) ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Trier par">
        <Select value={filters.sort ?? "recent"} onValueChange={(v) => patch({ sort: v === "recent" ? undefined : v })}>
          <SelectTrigger aria-label="Trier les résultats"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Section>
    </div>
  );
}
