"use client";

// ============================================================
// LocaBénin — AdminSettings : paramétrage sans code
// 5 sections avec sauvegarde partielle indépendante (PUT partiel) :
// (a) commission démarcheur (b) tarifs d'abonnement (c) rattachement
// type → catégorie (d) retraits (e) modération automatique.
// Chaque changement est pris en compte immédiatement, sans
// redéploiement (valeur stockée en base via lib/settings).
// Réinitialisation des formulaires : remontage par `key` dérivée
// des valeurs serveur (pas d'effet de synchronisation).
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Settings2, CreditCard, Repeat, Wallet, ShieldCheck, Info } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { label, LISTING_TYPES, LISTING_CATEGORIES } from "@/lib/constants";
import { RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/shared/form-bits";
import { AdminError, PageIntro, SectionCard } from "./components/bits";

interface AppSettingsClient {
  commissionTenantSharePct: number;
  commissionOwnerSharePct: number;
  affiliateWindowDays: number;
  affiliateAttribution: "last_click" | "first_click";
  commissionValidationDays: number;
  commissionMinDurationMonths: number;
  subscriptionGraceDays: number;
  payoutAutoApprovalThreshold: number;
  payoutMinAmount: number;
  autoPublishListings: boolean;
  typeCategoryMapping: Record<string, string>;
}

interface PricingRow {
  category: string;
  monthlyPrice: number;
  label: string;
  updatedAt: string;
}

interface SettingsData {
  settings: AppSettingsClient;
  pricing: PricingRow[];
}

const SETTINGS_KEY = ["admin", "settings"] as const;

/** Champ numérique simple (%, jours, mois) — commit au blur. */
function NumberField({
  value, onChange, min = 0, max = 999, suffix, ariaLabel, id,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  ariaLabel: string;
  id?: string;
}) {
  const [override, setOverride] = useState<string | null>(null);
  const display = override ?? String(value);
  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        aria-label={ariaLabel}
        onFocus={() => { if (value === 0) setOverride(""); }}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
          setOverride(digits);
          const n = parseInt(digits === "" ? "0" : digits, 10);
          onChange(Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0)));
        }}
        onBlur={() => setOverride(null)}
        className="pr-14"
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const q = useQuery<SettingsData>({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiGet<SettingsData>("/api/admin/settings"),
  });

  const put = useMutation({
    mutationFn: (vars: { patch?: Record<string, unknown>; pricing?: Array<{ category: string; monthlyPrice: number; label: string }> }) =>
      apiSend("/api/admin/settings", "PUT", vars),
    onSuccess: () => {
      toast.success("Paramètres enregistrés — pris en compte immédiatement, sans redéploiement");
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enregistrement impossible"),
  });

  if (q.isError) return <AdminError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-5 py-2">
        <PageIntro title="Paramétrage" description="Chargement des paramètres…" />
        <RowsSkeleton rows={8} />
      </div>
    );
  }

  const s = q.data.settings;

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Paramétrage sans code"
        description="Tous les paramètres métier de la plateforme. Chaque section s'enregistre indépendamment et est appliquée immédiatement, sans redéploiement."
      />

      {/* (a) Commission démarcheur — key serveur → remontage à jour */}
      <CommissionSection
        key={`c-${s.commissionTenantSharePct}-${s.commissionOwnerSharePct}-${s.affiliateWindowDays}-${s.affiliateAttribution}-${s.commissionValidationDays}-${s.commissionMinDurationMonths}`}
        s={s}
        saving={put.isPending}
        onSave={(patch) => put.mutate({ patch })}
      />

      {/* (b) Abonnements */}
      <SubscriptionSection
        key={`s-${s.subscriptionGraceDays}-${JSON.stringify(q.data.pricing)}`}
        s={s}
        pricing={q.data.pricing}
        saving={put.isPending}
        onSave={(patch, pricing) => put.mutate({ patch, pricing })}
      />

      {/* (c) Rattachement des types */}
      <MappingSection
        key={`m-${JSON.stringify(s.typeCategoryMapping)}`}
        s={s}
        saving={put.isPending}
        onSave={(patch) => put.mutate({ patch })}
      />

      {/* (d) Retraits */}
      <PayoutSection
        key={`p-${s.payoutAutoApprovalThreshold}-${s.payoutMinAmount}`}
        s={s}
        saving={put.isPending}
        onSave={(patch) => put.mutate({ patch })}
      />

      {/* (e) Modération */}
      <ModerationSection
        key={`mo-${String(s.autoPublishListings)}`}
        s={s}
        saving={put.isPending}
        onSave={(patch) => put.mutate({ patch })}
      />
    </div>
  );
}

function SaveBar({ saving, onSave, disabled }: { saving: boolean; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
        Pris en compte immédiatement, sans redéploiement.
      </p>
      <Button size="sm" onClick={onSave} disabled={saving || disabled}>
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
        Enregistrer cette section
      </Button>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div>
        <h3 className="font-display text-base font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/* ---------- (a) Commission démarcheur ---------- */

function CommissionSection({ s, saving, onSave }: { s: AppSettingsClient; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [tenantPct, setTenantPct] = useState(s.commissionTenantSharePct);
  const [ownerPct, setOwnerPct] = useState(s.commissionOwnerSharePct);
  const [windowDays, setWindowDays] = useState(s.affiliateWindowDays);
  const [attribution, setAttribution] = useState(s.affiliateAttribution);
  const [validationDays, setValidationDays] = useState(s.commissionValidationDays);
  const [minMonths, setMinMonths] = useState(s.commissionMinDurationMonths);

  const dirty =
    tenantPct !== s.commissionTenantSharePct || ownerPct !== s.commissionOwnerSharePct ||
    windowDays !== s.affiliateWindowDays || attribution !== s.affiliateAttribution ||
    validationDays !== s.commissionValidationDays || minMonths !== s.commissionMinDurationMonths;

  return (
    <SectionCard>
      <SectionHeader
        icon={Settings2}
        title="Commission démarcheur"
        description="Parts prélevées sur un mois de loyer lors d'une location via un lien d'affiliation."
      />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-pct">Part locataire</Label>
          <NumberField id="tenant-pct" value={tenantPct} onChange={setTenantPct} min={0} max={100} suffix="%" ariaLabel="Part locataire en pourcentage d'un mois de loyer" />
          <p className="text-xs text-muted-foreground">Payée par le locataire au moment du paiement d&apos;entrée.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner-pct">Part propriétaire</Label>
          <NumberField id="owner-pct" value={ownerPct} onChange={setOwnerPct} min={0} max={100} suffix="%" ariaLabel="Part propriétaire en pourcentage d'un mois de loyer" />
          <p className="text-xs text-muted-foreground">Déduite du portefeuille du propriétaire.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="window-days">Fenêtre d&apos;affiliation</Label>
          <NumberField id="window-days" value={windowDays} onChange={setWindowDays} min={1} max={365} suffix="jours" ariaLabel="Fenêtre de validité de l'affiliation en jours" />
          <p className="text-xs text-muted-foreground">Durée de validité d&apos;un clic de démarcheur.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Politique d&apos;attribution</Label>
          <Select value={attribution} onValueChange={(v) => setAttribution(v as "last_click" | "first_click")}>
            <SelectTrigger aria-label="Politique d'attribution des clics"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_click">Dernier clic prime</SelectItem>
              <SelectItem value="first_click">Premier clic prime</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Règle appliquée quand plusieurs démarcheurs sont cliqués.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="validation-days">Période de validation</Label>
          <NumberField id="validation-days" value={validationDays} onChange={setValidationDays} min={0} max={90} suffix="jours" ariaLabel="Période de validation anti-fraude en jours" />
          <p className="text-xs text-muted-foreground">Délai avant que la commission soit retirable (anti-fraude).</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="min-months">Durée minimale (meublés)</Label>
          <NumberField id="min-months" value={minMonths} onChange={setMinMonths} min={0} max={24} suffix="mois" ariaLabel="Durée minimale de location pour qu'une commission s'applique, en mois" />
          <p className="text-xs text-muted-foreground">0 = commission quelle que soit la durée.</p>
        </div>
      </div>
      <SaveBar saving={saving} disabled={!dirty} onSave={() =>
        onSave({
          commissionTenantSharePct: tenantPct,
          commissionOwnerSharePct: ownerPct,
          affiliateWindowDays: windowDays,
          affiliateAttribution: attribution,
          commissionValidationDays: validationDays,
          commissionMinDurationMonths: minMonths,
        })
      } />
    </SectionCard>
  );
}

/* ---------- (b) Abonnements ---------- */

function SubscriptionSection({
  s, pricing, saving, onSave,
}: {
  s: AppSettingsClient;
  pricing: PricingRow[];
  saving: boolean;
  onSave: (patch: Record<string, unknown>, pricing: Array<{ category: string; monthlyPrice: number; label: string }>) => void;
}) {
  const [rows, setRows] = useState<Array<{ category: string; monthlyPrice: number; label: string }>>(
    pricing.map((p) => ({ category: p.category, monthlyPrice: p.monthlyPrice, label: p.label })),
  );
  const [grace, setGrace] = useState(s.subscriptionGraceDays);

  const dirty =
    grace !== s.subscriptionGraceDays ||
    JSON.stringify(rows) !== JSON.stringify(pricing.map((p) => ({ category: p.category, monthlyPrice: p.monthlyPrice, label: p.label })));

  return (
    <SectionCard>
      <SectionHeader
        icon={CreditCard}
        title="Abonnements propriétaires"
        description="Tarif mensuel par catégorie active (une fois par catégorie, quel que soit le nombre d'offres)."
      />
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Catégorie</TableHead>
              <TableHead>Libellé affiché</TableHead>
              <TableHead className="w-48">Prix / mois</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.category}>
                <TableCell><span className="text-sm font-semibold">{label(row.category)}</span></TableCell>
                <TableCell>
                  <Input
                    value={row.label}
                    aria-label={`Libellé de la catégorie ${label(row.category)}`}
                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                  />
                </TableCell>
                <TableCell>
                  <MoneyInput
                    value={row.monthlyPrice}
                    onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, monthlyPrice: v } : r)))}
                    ariaLabel={`Prix mensuel de la catégorie ${label(row.category)}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 max-w-xs space-y-1.5">
        <Label htmlFor="grace-days">Jours de grâce</Label>
        <NumberField id="grace-days" value={grace} onChange={setGrace} min={0} max={60} suffix="jours" ariaLabel="Jours de grâce après échéance d'abonnement" />
        <p className="text-xs text-muted-foreground">Délai après échéance avant masquage des offres impayées.</p>
      </div>
      <SaveBar saving={saving} disabled={!dirty}
        onSave={() => onSave({ subscriptionGraceDays: grace }, rows)} />
    </SectionCard>
  );
}

/* ---------- (c) Rattachement type → catégorie ---------- */

function MappingSection({ s, saving, onSave }: { s: AppSettingsClient; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [mapping, setMapping] = useState<Record<string, string>>({ ...s.typeCategoryMapping });

  const dirty = JSON.stringify(mapping) !== JSON.stringify(s.typeCategoryMapping);

  return (
    <SectionCard>
      <SectionHeader
        icon={Repeat}
        title="Rattachement des types"
        description="Catégorie d'abonnement à laquelle chaque type de bien est rattaché (les meublés sont toujours « Appartements meublés »)."
      />
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">Type de bien</TableHead>
              <TableHead>Catégorie d&apos;abonnement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LISTING_TYPES.map((t) => (
              <TableRow key={t}>
                <TableCell><span className="text-sm font-medium">{label(t)}</span></TableCell>
                <TableCell>
                  <Select
                    value={mapping[t] ?? "EMPTY_HOUSING"}
                    onValueChange={(v) => setMapping({ ...mapping, [t]: v })}
                  >
                    <SelectTrigger className="w-56" aria-label={`Catégorie d'abonnement pour ${label(t)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LISTING_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{label(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <SaveBar saving={saving} disabled={!dirty} onSave={() => onSave({ typeCategoryMapping: mapping })} />
    </SectionCard>
  );
}

/* ---------- (d) Retraits ---------- */

function PayoutSection({ s, saving, onSave }: { s: AppSettingsClient; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [threshold, setThreshold] = useState(s.payoutAutoApprovalThreshold);
  const [minAmount, setMinAmount] = useState(s.payoutMinAmount);

  const dirty = threshold !== s.payoutAutoApprovalThreshold || minAmount !== s.payoutMinAmount;

  return (
    <SectionCard>
      <SectionHeader
        icon={Wallet}
        title="Retraits Mobile Money"
        description="Seuil d'approbation automatique et montant minimum de retrait."
      />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Seuil d&apos;auto-approbation</Label>
          <MoneyInput value={threshold} onChange={setThreshold} ariaLabel="Seuil d'auto-approbation des retraits en FCFA" />
          <p className="text-xs text-muted-foreground">Retraits ≤ ce montant : payés automatiquement après vérification OTP de l&apos;utilisateur.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Montant minimum de retrait</Label>
          <MoneyInput value={minAmount} onChange={setMinAmount} ariaLabel="Montant minimum de retrait en FCFA" />
          <p className="text-xs text-muted-foreground">En dessous de ce montant, la demande est refusée côté utilisateur.</p>
        </div>
      </div>
      <SaveBar saving={saving} disabled={!dirty}
        onSave={() => onSave({ payoutAutoApprovalThreshold: threshold, payoutMinAmount: minAmount })} />
    </SectionCard>
  );
}

/* ---------- (e) Modération ---------- */

function ModerationSection({ s, saving, onSave }: { s: AppSettingsClient; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [autoPublish, setAutoPublish] = useState(s.autoPublishListings);

  const dirty = autoPublish !== s.autoPublishListings;

  return (
    <SectionCard>
      <SectionHeader
        icon={ShieldCheck}
        title="Modération des offres"
        description="Publication automatique ou validation manuelle systématique."
      />
      <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border bg-background/60 px-4 py-3">
        <div>
          <Label htmlFor="auto-publish" className="cursor-pointer text-sm font-semibold">Publication automatique</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Si activée, les offres soumises sont publiées sans passage en file de modération. La modération manuelle reste possible a posteriori.
          </p>
        </div>
        <Switch id="auto-publish" checked={autoPublish} onCheckedChange={setAutoPublish} aria-label="Activer la publication automatique des offres" />
      </div>
      <SaveBar saving={saving} disabled={!dirty} onSave={() => onSave({ autoPublishListings: autoPublish })} />
    </SectionCard>
  );
}
