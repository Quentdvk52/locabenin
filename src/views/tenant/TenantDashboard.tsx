"use client";

// ============================================================
// LocaBénin — Espace Locataire : tableau de bord
// Logement actuel, prochain loyer avec compte à rebours, historique
// des échéances, paiements, réservations et favoris récents.
// ============================================================

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  Home, CalendarClock, ReceiptText, BedDouble, MapPin, Heart,
  ExternalLink, Armchair, ChevronRight, AlarmClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/badges";
import { KpiSkeleton, RowsSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { ListingCard } from "@/components/shared/listing-card";
import { PaymentDialog } from "./components/PaymentDialog";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  guardedGet, guardedSend, toCardData, pickCurrentLease, daysUntil,
  type RawLease, type RawSchedule, type PaymentHistoryItem, type RawListing, type PaymentIntent,
} from "./api";

function countdownText(s: RawSchedule): { text: string; urgent: boolean } {
  const days = daysUntil(s.dueDate);
  if (s.status === "LATE") return { text: `En retard depuis ${Math.abs(days)} jour(s)`, urgent: true };
  if (days <= 0) return { text: "Échéance aujourd'hui", urgent: true };
  if (days < 5) return { text: `Dans ${days} jour(s)`, urgent: true };
  return { text: `Dans ${days} jours`, urgent: false };
}

export function TenantDashboard() {
  const { user } = useSession();
  const [paySchedule, setPaySchedule] = useState<RawSchedule | null>(null);

  const leases = useQuery({
    queryKey: ["leases"],
    queryFn: () => guardedGet<RawLease[]>("/api/leases"),
  });

  const current = pickCurrentLease(leases.data ?? []);
  const detail = useQuery({
    queryKey: ["lease", current?.id],
    queryFn: () => guardedGet<RawLease>(`/api/leases/${current!.id}`),
    enabled: Boolean(current),
  });

  const history = useQuery({
    queryKey: ["payments-history"],
    queryFn: () => guardedGet<PaymentHistoryItem[]>("/api/payments/history"),
  });

  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => guardedGet<RawListing[]>("/api/me/favorites"),
  });

  const lease = detail.data ?? null;
  const coverUrl = lease?.listing.media?.[0]?.url ?? null;
  const schedules = lease?.schedules ?? [];
  const nextDue = schedules.find((s) => s.status === "PENDING" || s.status === "LATE" || s.status === "PARTIAL") ?? null;
  const pastSchedules = [...schedules]
    .filter((s) => s.id !== nextDue?.id)
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
    .slice(0, 5);
  const payments = history.data ?? [];
  const bookings = payments.filter((p) => p.purpose === "BOOKING").slice(0, 4);

  function payRent(schedule: RawSchedule) {
    setPaySchedule(schedule);
  }

  async function makeRentPayment(method: string): Promise<PaymentIntent> {
    if (!paySchedule) throw new Error("Aucune échéance sélectionnée.");
    const res = await guardedSend<{ payment: { reference: string; amount: number }; mockConfirmToken: string }>(
      "/api/payments/initiate", "POST", { purpose: "RENT", scheduleId: paySchedule.id, method },
    );
    return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken, amount: res.payment.amount };
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Bonjour {user?.fullName.split(" ")[0] ?? ""} 👋</h2>
        <p className="text-sm text-muted-foreground">Voici l&apos;état de vos locations et de vos paiements.</p>
      </div>

      {leases.isLoading && <KpiSkeleton count={4} />}
      {leases.isError && <ErrorState message="Impossible de charger vos baux." onRetry={() => void leases.refetch()} />}

      {!leases.isLoading && !leases.isError && !current && (
        <EmptyState
          icon={Home}
          title="Vous n'avez pas encore de bail"
          description="Explorez les offres disponibles et candidatez : votre bail apparaîtra ici dès que le propriétaire l'aura créé."
          actionLabel="Chercher un logement"
          actionHref="/recherche"
        />
      )}

      {current && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-4 lg:col-span-2">
            {/* Logement actuel */}
            <section className="overflow-hidden rounded-2xl border bg-card shadow-soft" aria-label="Mon logement actuel">
              <div className="relative aspect-[16/7] w-full bg-surface">
                {coverUrl ? (
                  <Image src={coverUrl} alt={`Photo de ${lease?.listing.title ?? "votre logement"}`} fill sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground"><Home className="size-10" aria-hidden /></div>
                )}
                <div className="absolute left-3 top-3"><StatusBadge status={current.status} /></div>
              </div>
              <div className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-bold">{lease?.listing.title ?? current.listing.title}</h3>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate("/locataire/bail")}>
                    Mon bail <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4" aria-hidden />
                  {lease?.listing.addressText ?? "Adresse communiquée par le propriétaire"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Bail <span className="font-medium text-foreground">{current.reference}</span> · {formatFcfa(current.rentAmount)} / {label(current.rentPeriod)} · depuis le {formatDate(current.startDate)}
                </p>
              </div>
            </section>

            {/* Prochain loyer */}
            <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Prochain loyer">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <CalendarClock className="size-4" aria-hidden /> Prochain loyer
                  </p>
                  {nextDue ? (
                    <>
                      <p className={cn("mt-1 font-display text-3xl font-bold", countdownText(nextDue).urgent ? "text-red-600" : "")}>
                        {formatFcfa(nextDue.amount - nextDue.paidAmount)}
                      </p>
                      <p className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", countdownText(nextDue).urgent && "text-red-600")}>
                        <AlarmClock className="size-4" aria-hidden />
                        Échéance du {formatDate(nextDue.dueDate)} — {countdownText(nextDue).text}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Aucune échéance en attente, tout est à jour 🎉</p>
                  )}
                </div>
                {nextDue && (
                  <Button size="lg" className="min-h-[48px] text-base" onClick={() => payRent(nextDue)}>
                    Payer mon loyer
                  </Button>
                )}
              </div>
            </section>

            {/* Historique des échéances */}
            <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Historique des échéances">
              <h3 className="font-display text-base font-bold">Échéances de loyer</h3>
              {detail.isLoading ? (
                <div className="mt-3"><RowsSkeleton rows={3} /></div>
              ) : pastSchedules.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Aucune échéance enregistrée pour le moment.</p>
              ) : (
                <ul className="mt-3 divide-y">
                  {pastSchedules.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">Échéance du {formatDate(s.dueDate)}</p>
                        {s.paidAt && <p className="text-xs text-muted-foreground">Payée le {formatDate(s.paidAt)}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold">{formatFcfa(s.amount)}</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Colonne latérale */}
          <div className="space-y-4">
            {/* Résumé paiements */}
            <section className="rounded-2xl border bg-card p-4 shadow-soft" aria-label="Mes paiements récents">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-base font-bold"><ReceiptText className="size-4 text-primary" aria-hidden /> Paiements récents</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/locataire/documents")}>Tout voir</Button>
              </div>
              {history.isLoading ? (
                <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>
              ) : payments.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Aucun paiement pour le moment.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {payments.slice(0, 4).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)} · {label(p.method)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{formatFcfa(p.amount)}</p>
                        <StatusBadge status={p.status} className="scale-90" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Réservations */}
            <section className="rounded-2xl border bg-card p-4 shadow-soft" aria-label="Mes réservations">
              <h3 className="flex items-center gap-2 font-display text-base font-bold"><Armchair className="size-4 text-primary" aria-hidden /> Réservations de meublés</h3>
              {bookings.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Aucune réservation en cours.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {bookings.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.bookingRef ? `Réservation ${p.bookingRef}` : "Réservation"} · {formatDate(p.createdAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{formatFcfa(p.amount)}</p>
                        <StatusBadge status={p.status} className="scale-90" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Favoris récents */}
            <section className="rounded-2xl border bg-card p-4 shadow-soft" aria-label="Favoris récents">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-base font-bold"><Heart className="size-4 text-primary" aria-hidden /> Favoris récents</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/favoris")}>Tout voir</Button>
              </div>
              {favorites.isLoading ? (
                <div className="mt-3 space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}</div>
              ) : (favorites.data?.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Aucun favori — touchez le cœur sur une offre pour la retrouver ici.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {favorites.data!.slice(0, 3).map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => navigate(`/offres/${l.id}`)}
                        className="flex min-h-[52px] w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-secondary/50"
                      >
                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
                          {l.coverUrl ? <Image src={l.coverUrl} alt="" width={40} height={40} className="size-10 object-cover" /> : <BedDouble className="size-4 text-muted-foreground" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{l.title}</span>
                          <span className="block text-xs text-muted-foreground">{formatFcfa(l.rentAmount)} / {label(l.rentPeriod)}</span>
                        </span>
                        <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Grille complète des favoris (cartes premium) */}
      {!leases.isLoading && (favorites.data?.length ?? 0) > 0 && (
        <section aria-label="Vos favoris en détail">
          <h3 className="mb-3 font-display text-base font-bold">Vos favoris</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.data!.slice(0, 3).map((l) => (
              <ListingCard key={l.id} listing={toCardData(l)} />
            ))}
          </div>
        </section>
      )}

      <PaymentDialog
        open={Boolean(paySchedule)}
        onClose={() => setPaySchedule(null)}
        makePayment={makeRentPayment}
        onSuccess={() => { void leases.refetch(); void detail.refetch(); }}
        title="Paiement de loyer"
      />
    </div>
  );
}

