"use client";

// ============================================================
// LocaBénin — Mes locataires (propriétaire)
// Cards par bail : locataire, bien, stats de paiement ; actions :
// détail du bail (échéancier), création de bail depuis une
// candidature acceptée, message, relance de loyer, préavis,
// restitution de caution avec retenues.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Users, Phone, FileText, MessageSquare, BellRing, LogOut, HandCoins, Plus, Loader2, ChevronDown, Trash2,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { StatusBadge, KycBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, CardsSkeleton } from "@/components/shared/states";
import { StatRow, MoneyInput } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { handleApiError, initials, formatDateFr, toDateInput } from "./components/helpers";
import { cn } from "@/lib/utils";

interface TenantLease {
  leaseId: string;
  leaseReference: string;
  leaseStatus: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  depositReturnedAmount: number;
  depositReturnedAt: string | null;
  contractPdfUrl: string | null;
  allowPartial: boolean;
  listing: { id: string; title: string; reference: string; type: string; genre: string };
  tenant: { id: string; fullName: string; phone: string | null; kycStatus: string; createdAt: string };
  stats: {
    paidTotal: number;
    expectedTotal: number;
    balanceDue: number;
    lateCount: number;
    schedulesCount: number;
    nextDueDate: string | null;
    nextAmount: number;
    openTickets: number;
    hasInitialPayment: boolean;
  };
}

/** Période en français (mois, trimestre, semestre, an, jour, semaine). */
function periodLabel(period: string): string {
  const map: Record<string, string> = { DAY: "jour", WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre", SEMESTER: "semestre", LEASE: "an" };
  return map[period] ?? period.toLowerCase();
}

interface TenantsData {
  tenants: TenantLease[];
  statsByStatus: Record<string, number>;
  totalBalanceDue: number;
  count: number;
}

interface AcceptedApplication {
  id: string;
  leaseId: string | null;
  listing: { id: string; title: string; rentAmount: number; rentPeriod: string; genre: string };
  tenant: { id: string; fullName: string; phone: string | null; kycStatus: string };
  createdAt: string;
}

interface LeaseDetail {
  id: string;
  reference: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  depositReturnedAmount: number;
  ownerSignatureUrl: string | null;
  tenantSignatureUrl: string | null;
  contractPdfUrl: string | null;
  commissionTotal: number;
  schedules: Array<{ id: string; dueDate: string; amount: number; paidAmount: number; status: string; quittanceUrl: string | null }>;
  tenant: { fullName: string; phone: string | null };
  listing: { title: string };
}

export default function OwnerTenants() {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [depositFor, setDepositFor] = useState<TenantLease | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [deductions, setDeductions] = useState<Array<{ label: string; amount: number }>>([]);

  const { data, isLoading, isError, error, refetch } = useQuery<TenantsData>({
    queryKey: ["owner", "tenants"],
    queryFn: () => apiGet<TenantsData>("/api/owner/tenants"),
  });

  // Candidatures acceptées sans bail → « Créer le bail »
  const pendingLeases = useQuery<AcceptedApplication[]>({
    queryKey: ["applications", "accepted-no-lease"],
    queryFn: async () => {
      const apps = await apiGet<AcceptedApplication[]>("/api/applications");
      return apps.filter((a) => a.status === "ACCEPTED" && !a.leaseId && a.listing.genre !== "FURNISHED");
    },
  });

  const detail = useQuery<LeaseDetail>({
    queryKey: ["lease", detailId],
    queryFn: () => apiGet<LeaseDetail>(`/api/leases/${detailId}`),
    enabled: Boolean(detailId),
  });

  // ---- Mutations ----
  const msgMutation = useMutation({
    mutationFn: ({ recipientId, listingId, message }: { recipientId: string; listingId?: string; message: string }) =>
      apiSend<{ conversationId: string }>("/api/conversations", "POST", { recipientId, ...(listingId ? { listingId } : {}), message }),
    onError: (e) => handleApiError(e, "Envoi du message impossible."),
  });

  const leaseMutation = useMutation({
    mutationFn: ({ applicationId, startDate, leaseMonths }: { applicationId: string; startDate: string; leaseMonths: number }) =>
      apiSend("/api/leases", "POST", { applicationId, startDate, leaseMonths, allowPartial: false }),
    onSuccess: () => {
      toast.success("Bail créé.", { description: "Le locataire doit régler le paiement d'entrée pour activer la location." });
      void qc.invalidateQueries({ queryKey: ["applications"] });
      void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
      void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    },
    onError: (e) => handleApiError(e, "Création du bail impossible."),
  });

  const noticeMutation = useMutation({
    mutationFn: (leaseId: string) => apiSend(`/api/leases/${leaseId}`, "PATCH"),
    onSuccess: () => {
      toast.success("Préavis enregistré.", { description: "Sortie suggérée dans 2 mois — organisez l'état des lieux." });
      void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
    },
    onError: (e) => handleApiError(e, "Enregistrement du préavis impossible."),
  });

  const depositMutation = useMutation({
    mutationFn: ({ leaseId, amount, deductions: ded }: { leaseId: string; amount: number; deductions: Array<{ label: string; amount: number }> }) =>
      apiSend(`/api/leases/${leaseId}/deposit-return`, "POST", { amount, deductions: ded }),
    onSuccess: () => {
      toast.success("Caution restituée.", { description: "Le locataire a reçu le détail (retenues incluses)." });
      setDepositFor(null);
      setDeductions([]);
      void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
    },
    onError: (e) => handleApiError(e, "Restitution impossible."),
  });

  function openMessage(l: TenantLease) {
    msgMutation.mutate(
      { recipientId: l.tenant.id, listingId: l.listing.id, message: `Bonjour ${l.tenant.fullName.split(" ")[0]}, je vous contacte au sujet de « ${l.listing.title} ».` },
      {
        onSuccess: (res) => navigate(`/messagerie?c=${res.conversationId}`),
      },
    );
  }

  function sendReminder(l: TenantLease) {
    msgMutation.mutate(
      {
        recipientId: l.tenant.id,
        listingId: l.listing.id,
        message: `Rappel loyer — « ${l.listing.title} » : ${l.stats.lateCount} échéance(s) en retard pour un total de ${formatFcfa(l.stats.balanceDue)}. Merci de régler depuis votre espace locataire (Bail & loyer).`,
      },
      {
        onSuccess: () => toast.success("Relance envoyée.", { description: `Message + notification envoyés à ${l.tenant.fullName}.` }),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <ViewHeader title="Mes locataires" icon={Users} subtitle="Chargement…" />
        <CardsSkeleton count={4} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState message={error instanceof Error ? error.message : "Impossible de charger vos locataires."} onRetry={() => void refetch()} />
      </div>
    );
  }

  const toCreate = pendingLeases.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Mes locataires"
        subtitle={`${data.count} bail(s) — solde restant dû : ${formatFcfa(data.totalBalanceDue)}`}
        icon={Users}
      />

      {/* ---- Baux à créer (candidatures acceptées sans bail) ---- */}
      {toCreate.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-500/5 p-5 dark:border-amber-900" aria-label="Baux à créer">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-amber-800 dark:text-amber-400">
            <Plus className="size-4" aria-hidden /> Bail(s) à créer — {toCreate.length} candidature(s) acceptée(s)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Fixez la date de début et la durée : l&apos;échéancier de loyer est généré automatiquement.</p>
          <div className="mt-4 space-y-3">
            {toCreate.map((a) => (
              <CreateLeaseRow key={a.id} app={a} onCreate={(startDate, leaseMonths) => leaseMutation.mutate({ applicationId: a.id, startDate, leaseMonths })} busy={leaseMutation.isPending} />
            ))}
          </div>
        </section>
      )}

      {data.tenants.length === 0 ? (
        <EmptyState
          title="Aucun locataire pour le moment"
          description="Les baux apparaissent ici dès qu'une candidature acceptée devient un bail signé."
          actionLabel="Voir les candidatures"
          onAction={() => navigate("/proprietaire/visites")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.tenants.map((l) => (
            <article key={l.leaseId} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary" aria-hidden>
                    {initials(l.tenant.fullName)}
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold">{l.tenant.fullName}</h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3" aria-hidden /> {l.tenant.phone ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={l.leaseStatus} />
                  <KycBadge status={l.tenant.kycStatus} />
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-secondary/50 p-3">
                <p className="truncate text-sm font-semibold">{l.listing.title}</p>
                <p className="text-xs text-muted-foreground">
                  Bail {l.leaseReference} · depuis le {formatDateFr(l.startDate)} · {formatFcfa(l.rentAmount)} / {periodLabel(l.rentPeriod)}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border p-2">
                  <p className="text-[11px] text-muted-foreground">Payé</p>
                  <p className="font-display text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatFcfa(l.stats.paidTotal)}</p>
                </div>
                <div className="rounded-xl border p-2">
                  <p className="text-[11px] text-muted-foreground">Reste dû</p>
                  <p className={cn("font-display text-sm font-bold", l.stats.balanceDue > 0 ? "text-amber-700 dark:text-amber-400" : "")}>{formatFcfa(l.stats.balanceDue)}</p>
                </div>
                <div className="rounded-xl border p-2">
                  <p className="text-[11px] text-muted-foreground">Retard</p>
                  <p className={cn("font-display text-sm font-bold", l.stats.lateCount > 0 ? "text-red-600" : "")}>{l.stats.lateCount} éch.</p>
                </div>
              </div>

              {!l.stats.hasInitialPayment && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-400">
                  Paiement d&apos;entrée non réglé — le bail s&apos;activera après paiement.
                </p>
              )}
              {l.stats.openTickets > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{l.stats.openTickets} ticket(s) de réparation en cours.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={() => setDetailId(l.leaseId)}>
                  <FileText className="size-4" aria-hidden /> Voir le bail
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => openMessage(l)} disabled={msgMutation.isPending}>
                  <MessageSquare className="size-4" aria-hidden /> Message
                </Button>
                {l.stats.lateCount > 0 && (
                  <Button variant="secondary" size="sm" className="h-9" onClick={() => sendReminder(l)} disabled={msgMutation.isPending}>
                    <BellRing className="size-4" aria-hidden /> Relancer
                  </Button>
                )}
                {l.leaseStatus === "ACTIVE" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-9 text-red-600 hover:text-red-600">
                        <LogOut className="size-4" aria-hidden /> Fin de bail
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Donner congé (préavis) ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Le bail {l.leaseReference} passera en « préavis donné ». Le locataire sera notifié et l&apos;état des lieux de sortie pourra être organisé (préavis indicatif : 2 mois).
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => noticeMutation.mutate(l.leaseId)}>Confirmer le préavis</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {(l.leaseStatus === "ACTIVE" || l.leaseStatus === "NOTICE_GIVEN") && l.depositAmount > 0 && !l.depositReturnedAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      setDepositFor(l);
                      setDepositAmount(0);
                      setDeductions([]);
                    }}
                  >
                    <HandCoins className="size-4" aria-hidden /> Restituer la caution
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---- Détail du bail ---- */}
      <Dialog open={Boolean(detailId)} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {detail.isLoading || !detail.data ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Chargement du bail…
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  Bail {detail.data.reference} <StatusBadge status={detail.data.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.data.listing.title} — locataire : {detail.data.tenant.fullName} ({detail.data.tenant.phone ?? "—"})
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <StatRow label="Loyer" value={`${formatFcfa(detail.data.rentAmount)} / ${periodLabel(detail.data.rentPeriod)}`} strong />
                  <StatRow label="Caution" value={formatFcfa(detail.data.depositAmount)} strong />
                  <StatRow label="Début" value={formatDateFr(detail.data.startDate)} />
                  <StatRow label="Fin" value={detail.data.endDate ? formatDateFr(detail.data.endDate) : "—"} />
                  <StatRow label="Commission démarcheur" value={formatFcfa(detail.data.commissionTotal)} />
                  <StatRow label="Caution restituée" value={detail.data.depositReturnedAt ? `${formatFcfa(detail.data.depositReturnedAmount)} le ${formatDateFr(detail.data.depositReturnedAt)}` : "—"} />
                </div>
                <Separator />
                <div>
                  <p className="mb-2 font-display text-sm font-semibold">Échéancier de loyer ({detail.data.schedules.length} échéance(s))</p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-secondary/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Échéance</th>
                          <th className="px-3 py-2 font-medium">Montant</th>
                          <th className="px-3 py-2 font-medium">Payé</th>
                          <th className="px-3 py-2 font-medium">Statut</th>
                          <th className="px-3 py-2 font-medium sr-only">Quittance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detail.data.schedules.map((s) => (
                          <tr key={s.id}>
                            <td className="px-3 py-2">{formatDateFr(s.dueDate)}</td>
                            <td className="px-3 py-2 font-medium">{formatFcfa(s.amount)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{formatFcfa(s.paidAmount)}</td>
                            <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                            <td className="px-3 py-2">
                              {s.quittanceUrl ? (
                                <a href={s.quittanceUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">PDF</a>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                        {detail.data.schedules.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Aucune échéance générée.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                {detail.data.contractPdfUrl && (
                  <a href={detail.data.contractPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                    <FileText className="size-4" aria-hidden /> Voir le contrat PDF
                  </a>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Restitution de caution ---- */}
      <Dialog open={Boolean(depositFor)} onOpenChange={(v) => !v && setDepositFor(null)}>
        <DialogContent className="sm:max-w-lg">
          {depositFor && (
            <>
              <DialogHeader>
                <DialogTitle>Restitution de caution</DialogTitle>
                <DialogDescription>
                  {depositFor.listing.title} — caution enregistrée : {formatFcfa(depositFor.depositAmount)}. Indiquez le montant rendu et les retenues justifiées (état des lieux de sortie).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Montant restitué au locataire</Label>
                  <MoneyInput value={depositAmount} onChange={setDepositAmount} ariaLabel="Montant restitué" />
                  <p className="text-xs text-muted-foreground">Maximum : {formatFcfa(depositFor.depositAmount)}.</p>
                </div>
                <div className="space-y-2">
                  <Label>Retenues (optionnel)</Label>
                  {deductions.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={d.label}
                        onChange={(e) => setDeductions((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="Ex. Réparation robinetterie"
                        aria-label={`Libellé de la retenue ${i + 1}`}
                        className="h-10 flex-1"
                      />
                      <MoneyInput
                        value={d.amount}
                        onChange={(v) => setDeductions((arr) => arr.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                        className="w-40"
                        ariaLabel={`Montant de la retenue ${i + 1}`}
                      />
                      <Button variant="ghost" size="icon" className="size-9" aria-label={`Supprimer la retenue ${i + 1}`} onClick={() => setDeductions((arr) => arr.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeductions((arr) => [...arr, { label: "", amount: 0 }])}
                  >
                    <Plus className="size-4" aria-hidden /> Ajouter une retenue
                  </Button>
                </div>
                <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                  Total retenues : <strong>{formatFcfa(deductions.reduce((a, d) => a + (d.amount || 0), 0))}</strong> · Restitué : <strong>{formatFcfa(depositAmount)}</strong>
                </p>
                <Button
                  className="h-11 w-full"
                  disabled={depositMutation.isPending || depositAmount <= 0}
                  onClick={() =>
                    depositMutation.mutate({
                      leaseId: depositFor.leaseId,
                      amount: depositAmount,
                      deductions: deductions.filter((d) => d.label.trim() && d.amount > 0),
                    })
                  }
                >
                  {depositMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Confirmer la restitution
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ligne « candidature acceptée sans bail » avec formulaire inline. */
function CreateLeaseRow({
  app, onCreate, busy,
}: {
  app: AcceptedApplication;
  onCreate: (startDate: string, leaseMonths: number) => void;
  busy: boolean;
}) {
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [leaseMonths, setLeaseMonths] = useState("12");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-4">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div>
          <p className="text-sm font-semibold">{app.tenant.fullName}</p>
          <p className="text-xs text-muted-foreground">
            {app.listing.title} · {formatFcfa(app.listing.rentAmount)} / {periodLabel(app.listing.rentPeriod)} · acceptée le {formatDateFr(app.createdAt)}
          </p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`sd-${app.id}`} className="text-xs">Date de début du bail</Label>
            <Input id={`sd-${app.id}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label htmlFor={`lm-${app.id}`} className="text-xs">Durée du bail</Label>
            <Select value={leaseMonths} onValueChange={setLeaseMonths}>
              <SelectTrigger id={`lm-${app.id}`} className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 mois</SelectItem>
                <SelectItem value="12">12 mois</SelectItem>
                <SelectItem value="24">24 mois</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10" disabled={busy || !startDate} onClick={() => onCreate(startDate, parseInt(leaseMonths, 10))}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Créer le bail
          </Button>
        </div>
      )}
    </div>
  );
}
