"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : tableau de bord
// KPIs (clics, conversions, commissions), badge de niveau
// Bronze/Argent/Or et ressources de promotion prêtes à copier.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import {
  MousePointerClick, Handshake, Hourglass, BadgeCheck, Banknote, Percent,
  Medal, Copy, Loader2, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard, EmptyState, ErrorState, KpiSkeleton } from "@/components/shared/states";
import { navigate } from "@/lib/client/router";
import { formatFcfa } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { guardedGet, type AgentData } from "./api";

const TIERS = [
  { key: "BRONZE", name: "Bronze", min: 0, next: 3, bg: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300" },
  { key: "ARGENT", name: "Argent", min: 3, next: 10, bg: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300" },
  { key: "OR", name: "Or", min: 10, next: null, bg: "bg-amber-200 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300" },
] as const;

function tierFor(concluded: number) {
  if (concluded >= 10) return TIERS[2];
  if (concluded >= 3) return TIERS[1];
  return TIERS[0];
}

const PROMO_RESOURCES = [
  {
    title: "Message WhatsApp — diffusion de groupe",
    text: "Bonjour ! 👋 Je propose en ce moment de belles offres de logement vérifiées sur LocaBénin : maisons, appartements et studios disponibles avec bail sécurisé et paiement Mobile Money. Dites-moi votre quartier et votre budget, je vous envoie les liens avec photos. Merci de partager autour de vous !",
  },
  {
    title: "Message ciblé — personne qui cherche un logement",
    text: "Salut ! J'ai vu que tu cherchais un logement. Je travaille avec LocaBénin : je peux t'envoyer des offres vérifiées (photos réelles, propriétaire contrôlé, contrat signé électroniquement). Quel est ton budget et le quartier souhaité ? Je te fais une sélection aujourd'hui même.",
  },
  {
    title: "Message propriétaires — gagner des mandats",
    text: "Bonjour ! Vous avez un logement vacant ? Sur LocaBénin, je peux l'aider à trouver un locataire sérieux : annonce vérifiée, visites organisées, bail électronique et loyers suivis. Si vous le souhaitez, activez simplement l'option « Démarcheur » sur votre annonce et je m'occupe de la promotion.",
  },
] as const;

export function AgentDashboard() {
  const data = useQuery({
    queryKey: ["agent"],
    queryFn: () => guardedGet<AgentData>("/api/agent"),
  });

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Texte copié — collez-le dans WhatsApp !"))
      .catch(() => toast.error("Copie impossible sur ce navigateur."));
  }

  if (data.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <KpiSkeleton count={6} />
      </div>
    );
  }
  if (data.isError || !data.data) {
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState message="Impossible de charger vos statistiques." onRetry={() => void data.refetch()} />
      </div>
    );
  }

  const { stats, settings, links } = data.data;
  const tier = tierFor(stats.concluded);
  const nextTier = tier.next != null ? TIERS.find((t) => t.min === tier.next) ?? null : null;
  const progress = tier.next != null ? Math.min(100, Math.round((stats.concluded / tier.next) * 100)) : 100;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Votre activité de démarcheur</h2>
        <p className="text-sm text-muted-foreground">
          Commission : {settings.commissionTenantSharePct} % locataire + {settings.commissionOwnerSharePct} % propriétaire (½ mois de loyer au total).
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Clics totaux" value={String(stats.totalClicks)} sub={`${links.length} lien(s) actif(s)`} icon={MousePointerClick} />
        <KpiCard title="Locations conclues" value={String(stats.concluded)} sub="commissions validées + payées" icon={Handshake} />
        <KpiCard title="Commissions en attente" value={formatFcfa(stats.pending.total)} sub={`${stats.pending.count} en validation`} icon={Hourglass} />
        <KpiCard title="Commissions validées" value={formatFcfa(stats.validated.total)} sub={`${stats.validated.count} retirable(s)`} icon={BadgeCheck} />
        <KpiCard title="Commissions payées" value={formatFcfa(stats.paid.total)} sub={`${stats.paid.count} versée(s)`} icon={Banknote} />
        <KpiCard title="Taux de conversion" value={`${stats.conversionRate} %`} sub="clics → locations" icon={Percent} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Badge de niveau */}
        <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Niveau de démarcheur">
          <h3 className="flex items-center gap-2 font-display text-base font-bold"><Medal className="size-5 text-primary" aria-hidden /> Niveau de performance</h3>
          <div className="mt-3 flex items-center gap-3">
            <span className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 font-display text-lg font-bold", tier.bg)}>
              <Medal className="size-5" aria-hidden /> Badge {tier.name}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{stats.concluded} location(s) conclue(s)</span>
              {nextTier && <span>Prochain palier : {nextTier.min}</span>}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>🥉 Bronze — dès votre inscription, à vous de jouer</li>
            <li>🥈 Argent — 3 locations conclues (commissions validées ou payées)</li>
            <li>🥇 Or — 10 locations conclues : mise en avant de vos profils d&apos;annonces</li>
          </ul>
        </section>

        {/* Résumé portefeuille */}
        <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Portefeuille">
          <h3 className="font-display text-base font-bold">Portefeuille</h3>
          <p className="mt-2 font-display text-3xl font-bold text-primary">{formatFcfa(data.data.walletBalance)}</p>
          <p className="text-sm text-muted-foreground">disponible au retrait (validation anti-fraude de {settings.commissionValidationDays} jours)</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-[44px]" onClick={() => navigate("/demarcheur/wallet")}>Retirer vers Mobile Money</Button>
            <Button variant="outline" className="min-h-[44px]" onClick={() => navigate("/demarcheur/commissions")}>Voir mes commissions</Button>
          </div>
        </section>

        {/* Rappel du cycle */}
        <section className="rounded-2xl border border-dashed bg-secondary/40 p-4 sm:p-6" aria-label="Comment ça marche">
          <h3 className="font-display text-base font-bold">Comment ça marche ?</h3>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1.</strong> Prenez votre lien sur une offre affiliable (catalogue).</li>
            <li><strong className="text-foreground">2.</strong> Partagez-le sur WhatsApp, Facebook ou par SMS/QR.</li>
            <li><strong className="text-foreground">3.</strong> Le locataire candidate via votre lien (attribution 30 jours, dernier clic prime).</li>
            <li><strong className="text-foreground">4.</strong> À la confirmation du paiement d&apos;entrée, votre commission est créditée puis retirable après validation.</li>
          </ol>
        </section>
      </div>

      {/* Ressources de promotion */}
      <section aria-label="Ressources de promotion">
        <h3 className="flex items-center gap-2 font-display text-base font-bold"><MessageCircle className="size-5 text-primary" aria-hidden /> Ressources : textes prêts à partager</h3>
        <p className="text-sm text-muted-foreground">Copiez, personnalisez avec vos liens, envoyez. Trois messages testés pour démarrer.</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROMO_RESOURCES.map((r) => (
            <article key={r.title} className="flex flex-col rounded-2xl border bg-card p-4 shadow-soft">
              <h4 className="font-display text-sm font-bold">{r.title}</h4>
              <p className="mt-2 flex-1 rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">{r.text}</p>
              <Button variant="outline" size="sm" className="mt-3 min-h-[44px]" onClick={() => copyText(r.text)}>
                <Copy className="size-4" aria-hidden /> Copier le texte
              </Button>
            </article>
          ))}
        </div>
      </section>

      {/* État vide : aucun lien */}
      {links.length === 0 && (
        <EmptyState
          icon={MousePointerClick}
          title="Vous n'avez pas encore de lien"
          description="Rendez-vous dans le catalogue affiliable, choisissez une offre et générez votre premier lien de démarcheur."
          actionLabel="Voir le catalogue affiliable"
          actionHref="/demarcheur/catalogue"
        />
      )}

      {data.isFetching && !data.isLoading && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Actualisation…</p>
      )}
    </div>
  );
}
