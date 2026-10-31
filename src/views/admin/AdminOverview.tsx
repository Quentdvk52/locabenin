"use client";

// ============================================================
// LocaBénin — AdminOverview : vue d'ensemble du back-office
// KPIs, files d'action, graphiques 14 j, intégrité du ledger.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Users, Building2, CreditCard, Wallet, BadgeCheck, ShieldCheck,
  ShieldAlert, Megaphone, Scale, TrendingUp,
} from "lucide-react";
import { apiGet } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { label } from "@/lib/constants";
import { KpiCard, CardsSkeleton, KpiSkeleton } from "@/components/shared/states";
import { navigate } from "@/lib/client/router";
import { AdminError, ActionBanner, LedgerBadge, PageIntro, SectionCard, adminError } from "./components/bits";
import { Skeleton } from "@/components/ui/skeleton";

interface OverviewData {
  users: { total: number; byRole: Record<string, number>; new7d: number };
  listings: { total: number; byStatus: Record<string, number> };
  payments: { successCount30d: number; monthTotal: number; monthByPurpose: Array<{ purpose: string; count: number; total: number }> };
  subscriptions: { mrrPaid: number; mrrDue: number };
  commissions: { pending: { count: number; total: number }; validated: { count: number; total: number }; paid: { count: number; total: number } };
  payouts: { pendingCount: number; pendingAmount: number };
  reports: { open: number };
  kyc: { pending: number };
  moderation: { pendingReview: number };
  platform: { revenue: number; ledger: { debits: number; credits: number; balanced: boolean } };
  charts: {
    payments14d: Array<{ date: string; label: string; total: number; count: number }>;
    signups14d: Array<{ date: string; label: string; count: number }>;
  };
}

const CHART_GREEN = "var(--chart-1)";
const CHART_GOLD = "var(--chart-2)";

function ChartTooltip({ active, payload, label: l }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-soft">
      <p className="font-semibold">{l}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name} : <span className="font-semibold text-foreground">{typeof p.value === "number" && p.value > 1000 ? formatFcfa(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function AdminOverview() {
  const q = useQuery<OverviewData>({
    queryKey: ["admin", "overview"],
    queryFn: () => apiGet<OverviewData>("/api/admin/overview"),
    refetchInterval: 60_000,
  });

  if (q.isError) return <AdminError error={q.error} onRetry={() => void q.refetch()} />;

  if (q.isLoading) {
    return (
      <div className="space-y-6 py-2">
        <Skeleton className="h-8 w-64" />
        <KpiSkeleton count={8} />
        <CardsSkeleton count={2} />
      </div>
    );
  }

  const d = q.data!;
  const published = d.listings.byStatus["PUBLISHED"] ?? 0;
  const actions: Array<React.ReactNode> = [];
  if (d.moderation.pendingReview > 0) {
    actions.push(
      <ActionBanner key="mod" icon={Megaphone} count={d.moderation.pendingReview} tone="amber"
        title="Offres à modérer" description="File de validation des nouvelles offres" onClick={() => navigate("/admin/annonces")} />,
    );
  }
  if (d.kyc.pending > 0) {
    actions.push(
      <ActionBanner key="kyc" icon={BadgeCheck} count={d.kyc.pending} tone="amber"
        title="Vérifications d'identité en file" description="Documents KYC à examiner" onClick={() => navigate("/admin/kyc")} />,
    );
  }
  if (d.reports.open > 0) {
    actions.push(
      <ActionBanner key="rep" icon={ShieldAlert} count={d.reports.open} tone="red"
        title="Signalements ouverts" description="Contenus signalés par les utilisateurs" onClick={() => navigate("/admin/signalements")} />,
    );
  }
  if (d.payouts.pendingCount > 0) {
    actions.push(
      <ActionBanner key="pay" icon={Wallet} count={d.payouts.pendingCount} tone="amber"
        title="Retraits à approuver" description={`${formatFcfa(d.payouts.pendingAmount)} en attente de paiement`} onClick={() => navigate("/admin/retraits")} />,
    );
  }

  const ledger = d.platform.ledger;

  return (
    <div className="space-y-6 py-2">
      <PageIntro
        title="Vue d'ensemble"
        description="Pilotage de la plateforme : utilisateurs, offres, finances et files d'action."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard title="Utilisateurs" value={String(d.users.total)} icon={Users} sub={`+${d.users.new7d} sur 7 j`} />
        <KpiCard title="Offres publiées" value={String(published)} icon={Building2} sub={`${d.moderation.pendingReview} en modération`} />
        <KpiCard title="Revenus abonnements (mois)" value={formatFcfa(d.subscriptions.mrrPaid)} icon={CreditCard} sub={d.subscriptions.mrrDue > 0 ? `+ ${formatFcfa(d.subscriptions.mrrDue)} dus` : "À jour"} />
        <KpiCard title="Paiements du mois" value={formatFcfa(d.payments.monthTotal)} icon={Wallet} sub={`${d.payments.successCount30d} réussis sur 30 j`} />
        <KpiCard title="Commissions en attente" value={String(d.commissions.pending.count)} icon={Scale} sub={formatFcfa(d.commissions.pending.total)} />
        <KpiCard title="Retraits en attente" value={String(d.payouts.pendingCount)} icon={Wallet} sub={formatFcfa(d.payouts.pendingAmount)} />
        <KpiCard title="KYC en file" value={String(d.kyc.pending)} icon={BadgeCheck} sub="Identités à vérifier" />
        <KpiCard title="Offres en modération" value={String(d.moderation.pendingReview)} icon={Megaphone} sub="File PENDING_REVIEW" />
      </div>

      {/* Files d'action */}
      {actions.length > 0 && (
        <SectionCard title="À traiter" description="Files non vides — cliquez pour ouvrir l'onglet correspondant" contentClassName="space-y-2">
          {actions}
        </SectionCard>
      )}

      {/* Graphiques */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Paiements réussis — 14 derniers jours" description="Montant total encaissé par jour (tous motifs)">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.charts.payments14d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="total" name="Total" stroke={CHART_GREEN} strokeWidth={2} fill="url(#payGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Inscriptions — 14 derniers jours" description="Nouveaux comptes créés par jour">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.charts.signups14d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Inscriptions" fill={CHART_GOLD} radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Ledger + répartition */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Intégrité du ledger"
          description="Partie double : Σ débits doit égaler Σ crédits sur toutes les écritures immuables"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LedgerBadge balanced={ledger.balanced} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" aria-hidden />
              Réconciliation temps réel
            </p>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
              <dt className="text-muted-foreground">Σ débits</dt>
              <dd className="font-display font-bold">{formatFcfa(ledger.debits)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
              <dt className="text-muted-foreground">Σ crédits</dt>
              <dd className="font-display font-bold">{formatFcfa(ledger.credits)}</dd>
            </div>
            {!ledger.balanced && (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                Déséquilibre détecté : {formatFcfa(Math.abs(ledger.debits - ledger.credits))} d&apos;écart. Une investigation comptable est requise.
              </p>
            )}
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
              <dt className="text-muted-foreground">Revenus plateforme cumulés (abonnements)</dt>
              <dd className="font-display font-bold text-primary">{formatFcfa(d.platform.revenue)}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Répartition" description="Utilisateurs par rôle, paiements du mois par motif">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(d.users.byRole).map(([role, count]) => (
              <div key={role} className="rounded-xl border bg-background/60 px-3 py-2.5 text-center">
                <p className="font-display text-lg font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{label(role)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            {d.payments.monthByPurpose.length === 0 && (
              <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Aucun paiement réussi ce mois-ci.</p>
            )}
            {d.payments.monthByPurpose.map((p) => (
              <div key={p.purpose} className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{label(p.purpose)} <span className="text-xs">({p.count})</span></span>
                <span className="font-display font-bold">{formatFcfa(p.total)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
