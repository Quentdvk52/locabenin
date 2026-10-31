"use client";

// ============================================================
// LocaBénin — Tableau de bord propriétaire
// KPIs du mois, graphique revenus 6 mois, prochaines échéances,
// alertes contextuelles (facture impayée, offres en validation).
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Wallet, CalendarClock, AlertTriangle, Percent, Home,
  CalendarDays, Users, MessageSquare, CreditCard, ArrowRight, Hourglass,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { KpiCard, EmptyState, ErrorState, KpiSkeleton, RowsSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { PaymentDialog, type PaymentMethod } from "./components/PaymentDialog";
import { handleApiError, formatDateFr } from "./components/helpers";

interface DashboardData {
  kpis: {
    revenueThisMonth: number;
    revenuePrevMonth: number;
    trend: number;
    expectedRent: number;
    lateRent: number;
    occupancyRate: number;
    activeListings: number;
    totalListings: number;
    rentedCount: number;
    pendingReviewCount: number;
    suspendedUnpaidCount: number;
    upcomingVisits: number;
    pendingApplications: number;
    unreadMessages: number;
  };
  revenueSeries: Array<{ key: string; label: string; total: number }>;
  nextSchedules: Array<{ id: string; dueDate: string; amount: number; remaining: number; status: string; listingTitle: string; leaseId: string }>;
  subscription: {
    total: number;
    lineItems: Array<{ category: string; label: string; price: number; listingCount: number }>;
    currentInvoice: { id: string; amount: number; status: string; dueDate: string } | null;
    hasOverdueBeyondGrace: boolean;
    graceDays: number;
  };
}

export default function OwnerDashboard() {
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<DashboardData>({
    queryKey: ["owner", "dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/owner/dashboard"),
  });

  const unpaidInvoice = useMemo(() => {
    const inv = data?.subscription.currentInvoice;
    if (!inv) return null;
    return inv.status === "DUE" || inv.status === "OVERDUE" ? inv : null;
  }, [data]);

  async function paySubscription(method: PaymentMethod) {
    if (!unpaidInvoice) throw new Error("Aucune facture à payer.");
    const res = await apiSend<{ payment: { reference: string }; mockConfirmToken?: string }>("/api/payments/initiate", "POST", {
      purpose: "SUBSCRIPTION",
      invoiceId: unpaidInvoice.id,
      method,
    });
    return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken };
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <ViewHeader title="Tableau de bord" subtitle="Chargement de vos indicateurs…" icon={LayoutDashboard} />
        <KpiSkeleton count={8} />
        <RowsSkeleton rows={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState message={error instanceof Error ? error.message : "Impossible de charger le tableau de bord."} onRetry={() => void refetch()} />
      </div>
    );
  }

  const k = data.kpis;
  const maxRevenue = Math.max(1, ...data.revenueSeries.map((m) => m.total));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Tableau de bord"
        subtitle="Vos indicateurs de gestion en temps réel"
        icon={LayoutDashboard}
        action={
          <Button onClick={() => navigate("/proprietaire/biens/nouveau")} className="h-11">
            <Home className="size-4" aria-hidden /> Publier une offre
          </Button>
        }
      />

      {/* ---- Alertes contextuelles ---- */}
      <div className="space-y-3">
        {unpaidInvoice && (
          <Alert className={data.subscription.hasOverdueBeyondGrace ? "border-red-300 dark:border-red-900" : "border-amber-300 dark:border-amber-900"}>
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>
              Facture d&apos;abonnement {unpaidInvoice.status === "OVERDUE" ? "en retard" : "à payer"} — {formatFcfa(unpaidInvoice.amount)}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Échéance le {formatDateFr(unpaidInvoice.dueDate)}. Passé un délai de grâce de {data.subscription.graceDays} jours,
                vos offres sont masquées automatiquement.
              </span>
              <Button size="sm" variant={data.subscription.hasOverdueBeyondGrace ? "destructive" : "default"} onClick={() => setPayOpen(true)} className="h-9">
                <CreditCard className="size-4" aria-hidden /> Payer maintenant
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {k.pendingReviewCount > 0 && (
          <Alert>
            <Hourglass className="size-4" aria-hidden />
            <AlertTitle>{k.pendingReviewCount} offre(s) en validation par l&apos;équipe</AlertTitle>
            <AlertDescription>
              Vos offres sont vérifiées avant publication (généralement sous 24 h). Vous recevrez une notification dès leur mise en ligne.
            </AlertDescription>
          </Alert>
        )}
        {k.lateRent > 0 && (
          <Alert className="border-red-300 dark:border-red-900">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>Loyers en retard : {formatFcfa(k.lateRent)}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Un ou plusieurs locataires ont dépassé la date d&apos;échéance.</span>
              <Button size="sm" variant="outline" onClick={() => navigate("/proprietaire/locataires")} className="h-9">
                Envoyer des relances <ArrowRight className="size-4" aria-hidden />
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Revenus du mois" value={formatFcfa(k.revenueThisMonth)} icon={Wallet} trend={k.trend} sub={`vs ${formatFcfa(k.revenuePrevMonth)} le mois dernier`} />
        <KpiCard title="Loyers attendus" value={formatFcfa(k.expectedRent)} icon={CalendarClock} sub="échéances à venir" />
        <KpiCard
          title="Loyers en retard"
          value={formatFcfa(k.lateRent)}
          icon={AlertTriangle}
          className={k.lateRent > 0 ? "border-red-300 dark:border-red-900" : undefined}
          sub={k.lateRent > 0 ? "relancez vos locataires" : "tout est à jour"}
        />
        <KpiCard title="Taux d'occupation" value={`${k.occupancyRate} %`} icon={Percent} sub={`${k.rentedCount} bien(s) loué(s) sur ${k.totalListings}`} />
        <KpiCard title="Offres actives" value={String(k.activeListings)} icon={Home} sub={`${k.totalListings} offre(s) au total`} />
        <KpiCard title="Visites à venir" value={String(k.upcomingVisits)} icon={CalendarDays} sub="dans les 7 jours" />
        <KpiCard title="Candidatures en attente" value={String(k.pendingApplications)} icon={Users} sub="à traiter" />
        <KpiCard title="Messages non lus" value={String(k.unreadMessages)} icon={MessageSquare} sub="conversations" />
      </div>

      {/* ---- Graphique + échéances ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-3" aria-label="Revenus des 6 derniers mois">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Revenus encaissés — 6 derniers mois</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/proprietaire/finances")}>
              Finances <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenueSeries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis
                  width={70}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  domain={[0, Math.ceil(maxRevenue / 50_000) * 50_000 || 50_000]}
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("fr-FR")} M` : v >= 1_000 ? `${Math.round(v / 1_000)} k` : String(v))}
                />
                <Tooltip
                  formatter={(v) => [formatFcfa(Number(v)), "Encaissé"]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--card-foreground)" }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                />
                <Area type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2" aria-label="Prochaines échéances de loyer">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Prochaines échéances</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/proprietaire/locataires")}>
              Mes locataires <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
          {data.nextSchedules.length === 0 ? (
            <EmptyState
              className="mt-4"
              title="Aucune échéance programmée"
              description="Créez un bail depuis une candidature acceptée pour générer l'échéancier de loyer."
              actionLabel="Voir les candidatures"
              onAction={() => navigate("/proprietaire/visites")}
            />
          ) : (
            <ul className="mt-3 divide-y">
              {data.nextSchedules.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.listingTitle}</p>
                    <p className="text-xs text-muted-foreground">Échéance le {formatDateFr(s.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold font-display">{formatFcfa(s.remaining)}</span>
                    <StatusBadge status={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Abonnement ---- */}
      <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-label="Abonnement">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Abonnement du mois</h2>
            <p className="text-sm text-muted-foreground">
              {data.subscription.lineItems.length === 0
                ? "Aucune catégorie active : publiez votre première offre pour activer l'abonnement."
                : data.subscription.lineItems.map((li) => `${li.label} (${li.listingCount} offre${li.listingCount > 1 ? "s" : ""})`).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-display text-2xl font-bold">{formatFcfa(data.subscription.total)}<span className="text-sm font-normal text-muted-foreground"> /mois</span></p>
            {data.subscription.currentInvoice && <StatusBadge status={data.subscription.currentInvoice.status} />}
            <Button variant="outline" size="sm" onClick={() => navigate("/proprietaire/abonnement")}>Détails <ArrowRight className="size-4" aria-hidden /></Button>
          </div>
        </div>
      </section>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Facture d'abonnement"
        description="Régler l'abonnement du mois en cours"
        amount={unpaidInvoice?.amount ?? 0}
        makePayment={paySubscription}
        onSuccess={() => {
          void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
          void qc.invalidateQueries({ queryKey: ["subscription"] });
          toast.success("Abonnement réglé : vos offres restent publiées.");
        }}
      />
    </div>
  );
}
