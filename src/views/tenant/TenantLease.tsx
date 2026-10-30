"use client";

// ============================================================
// LocaBénin — Espace Locataire : « Mon bail & loyer »
// Détail du bail, échéancier avec paiement par échéance, paiement
// d'entrée, signature électronique du contrat, préavis et avis.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, FileSignature, Download, Megaphone, Star, Users, Wallet, ShieldCheck, Loader2, ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, KycBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { StatRow } from "@/components/shared/form-bits";
import { PaymentDialog } from "./components/PaymentDialog";
import { SignaturePad } from "./components/SignaturePad";
import { navigate } from "@/lib/client/router";
import { formatFcfa, formatDate, initialPaymentBreakdown, sumLines } from "@/lib/finance";
import { label } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  guardedGet, guardedSend, pickCurrentLease, parseDepositOptions,
  type RawLease, type RawSchedule, type PaymentHistoryItem, type PaymentIntent,
} from "./api";

type Schedule = RawSchedule;

export function TenantLease() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paySchedule, setPaySchedule] = useState<Schedule | null>(null);
  const [initialOpen, setInitialOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const leases = useQuery({
    queryKey: ["leases"],
    queryFn: () => guardedGet<RawLease[]>("/api/leases"),
  });

  const allLeases = leases.data ?? [];
  const current = pickCurrentLease(allLeases);
  const leaseId = selectedId ?? current?.id ?? null;

  const detail = useQuery({
    queryKey: ["lease", leaseId],
    queryFn: () => guardedGet<RawLease>(`/api/leases/${leaseId}`),
    enabled: Boolean(leaseId),
  });

  const history = useQuery({
    queryKey: ["payments-history"],
    queryFn: () => guardedGet<PaymentHistoryItem[]>("/api/payments/history"),
  });

  const lease = detail.data ?? null;

  // Paiement d'entrée réglé ? → déduit de l'historique des paiements
  const initialPaid = useMemo(
    () => (history.data ?? []).some((p) => p.purpose === "INITIAL" && p.status === "SUCCESS" && p.leaseRef === lease?.reference),
    [history.data, lease?.reference],
  );

  // Aperçu transparent du paiement d'entrée (calcul identique au serveur)
  const entryPreview = useMemo(() => {
    if (!lease) return null;
    const lines = initialPaymentBreakdown({
      rentAmount: lease.rentAmount,
      rentPeriod: lease.rentPeriod as never,
      depositAmount: lease.depositAmount,
      advanceMonths: lease.advanceMonths,
      depositOptions: parseDepositOptions(lease.depositOptionsJson),
      commissionTenantShare: lease.commissionTenantShare,
    });
    return { lines, total: sumLines(lines) };
  }, [lease]);

  const schedules = lease?.schedules ?? [];
  const terminated = lease?.status === "TERMINATED" || lease?.status === "EXPIRED";

  function refreshAll() {
    void leases.refetch();
    void detail.refetch();
    void history.refetch();
    void qc.invalidateQueries({ queryKey: ["leases"] });
  }

  async function makeSchedulePayment(method: string): Promise<PaymentIntent> {
    if (!paySchedule) throw new Error("Aucune échéance sélectionnée.");
    const res = await guardedSend<{ payment: { reference: string; amount: number }; mockConfirmToken: string }>(
      "/api/payments/initiate", "POST", { purpose: "RENT", scheduleId: paySchedule.id, method },
    );
    return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken, amount: res.payment.amount };
  }

  async function makeInitialPayment(method: string): Promise<PaymentIntent> {
    if (!lease) throw new Error("Aucun bail sélectionné.");
    const res = await guardedSend<{ payment: { reference: string; amount: number; status: string }; mockConfirmToken: string; breakdown: Array<{ label: string; amount: number }> }>(
      "/api/payments/initiate", "POST", { purpose: "INITIAL", leaseId: lease.id, method },
    );
    return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken, amount: res.payment.amount, breakdown: res.breakdown };
  }

  async function submitSignature() {
    if (!lease || !signature) return;
    setBusy(true);
    try {
      await guardedSend(`/api/leases/${lease.id}`, "POST", { signatureDataUrl: signature, party: "TENANT" });
      toast.success("Signature enregistrée. Le contrat signé est dans votre coffre-fort.");
      setSignOpen(false);
      setSignature(null);
      refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signature impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function giveNotice() {
    if (!lease) return;
    setBusy(true);
    try {
      await guardedSend(`/api/leases/${lease.id}`, "PATCH");
      toast.success("Préavis notifié. Le propriétaire a été informé et organisera l'état des lieux de sortie.");
      refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Préavis impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!lease) return;
    setBusy(true);
    try {
      await guardedSend("/api/reviews", "POST", { leaseId: lease.id, rating, comment: comment.trim() || undefined });
      toast.success("Merci pour votre avis ! Il est désormais visible sur l'annonce.");
      setReviewOpen(false);
      setComment("");
      setRating(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (leases.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <RowsSkeleton rows={4} />
      </div>
    );
  }
  if (leases.isError) {
    return <div className="mx-auto max-w-7xl"><ErrorState message="Impossible de charger vos baux." onRetry={() => void leases.refetch()} /></div>;
  }
  if (allLeases.length === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        <EmptyState
          icon={KeyRound}
          title="Aucun bail pour l'instant"
          description="Dès qu'un propriétaire accepte votre candidature et crée le bail, toutes les informations et votre échéancier apparaîtront ici."
          actionLabel="Chercher un logement"
          actionHref="/recherche"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Sélecteur de bail */}
      {allLeases.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="lease-select" className="text-sm font-medium">Mes baux :</label>
          <Select value={leaseId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger id="lease-select" className="w-full sm:w-80"><SelectValue placeholder="Choisir un bail" /></SelectTrigger>
            <SelectContent>
              {allLeases.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.reference} — {l.listing.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {detail.isLoading && <RowsSkeleton rows={4} />}
      {detail.isError && <ErrorState message="Impossible de charger ce bail." onRetry={() => void detail.refetch()} />}

      {lease && (
        <>
          {/* En-tête du bail */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Détail du bail">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-bold">{lease.listing.title}</h2>
                  <StatusBadge status={lease.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bail <span className="font-medium text-foreground">{lease.reference}</span>
                  · du {formatDate(lease.startDate)} {lease.endDate ? `au ${formatDate(lease.endDate)}` : "(durée indéterminée)"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={lease.contractPdfUrl ?? `/api/pdf/contract/${lease.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-secondary/60"
                >
                  <Download className="size-4" aria-hidden /> Télécharger le contrat
                </a>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <StatRow label="Loyer" value={`${formatFcfa(lease.rentAmount)} / ${label(lease.rentPeriod)}`} strong />
                <StatRow label="Caution" value={formatFcfa(lease.depositAmount)} />
                <StatRow label="Avances (mois)" value={String(lease.advanceMonths)} />
                {lease.commissionTotal > 0 && <StatRow label="Frais de démarcheur (part locataire)" value={formatFcfa(lease.commissionTenantShare)} />}
              </div>
              <div>
                <StatRow label="Avances déjà réglées" value={formatFcfa(lease.advancePaidAmount)} />
                <StatRow
                  label="Signature locataire"
                  value={lease.tenantSignedAt ? `Signé le ${formatDate(lease.tenantSignedAt)}` : "En attente"}
                />
                <StatRow
                  label="Signature propriétaire"
                  value={lease.ownerSignedAt ? `Signé le ${formatDate(lease.ownerSignedAt)}` : "En attente"}
                />
              </div>
            </div>
          </section>

          {/* Paiement d'entrée */}
          {lease.status === "ACTIVE" && !initialPaid && entryPreview && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-6 dark:border-amber-500/40 dark:bg-amber-950/30" aria-label="Paiement d'entrée">
              <h3 className="flex items-center gap-2 font-display text-base font-bold">
                <Wallet className="size-5 text-amber-700 dark:text-amber-400" aria-hidden />
                Paiement d&apos;entrée à régler
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  {entryPreview.lines.map((l) => (
                    <StatRow key={l.label} label={l.label} value={formatFcfa(l.amount)} />
                  ))}
                  <StatRow label="Total à payer" value={formatFcfa(entryPreview.total)} strong />
                </div>
                <div className="flex flex-col justify-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Ce paiement couvre la caution, les avances éventuelles et les frais de démarcheur. Il est obligatoire avant la signature du contrat.
                  </p>
                  <Button size="lg" className="min-h-[48px]" onClick={() => setInitialOpen(true)}>
                    Régler le paiement d&apos;entrée
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* Actions contrat */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Actions sur le contrat">
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold"><FileSignature className="size-4 text-primary" aria-hidden /> Signature du contrat</h3>
              {lease.tenantSignedAt ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="size-4" aria-hidden /> Signé le {formatDate(lease.tenantSignedAt, true)}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {initialPaid ? "Signez électroniquement pour officialiser votre bail." : "Réglez d'abord le paiement d'entrée pour débloquer la signature."}
                  </p>
                  <Button className="mt-3 w-full" disabled={!initialPaid} onClick={() => { setSignature(null); setSignOpen(true); }}>
                    Signer le contrat
                  </Button>
                </>
              )}
              {lease.contractHash && (
                <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={lease.contractHash}>
                  Hash SHA-256 : {lease.contractHash.slice(0, 16)}…
                </p>
              )}
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold"><Megaphone className="size-4 text-primary" aria-hidden /> Préavis de départ</h3>
              {lease.status === "ACTIVE" ? (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">Vous quittez le logement ? Notifiez votre préavis (2 mois suggérés) directement ici.</p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="mt-3 w-full">Donner mon préavis</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmer votre préavis ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action informe le propriétaire et déclenche l&apos;organisation de l&apos;état des lieux de sortie. Elle est irréversible pour ce bail.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void giveNotice()} disabled={busy}>Confirmer le préavis</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : lease.status === "NOTICE_GIVEN" ? (
                <p className="mt-2 text-sm text-muted-foreground">Préavis donné le {formatDate(lease.noticeDate ?? lease.startDate)}. L&apos;état des lieux sera organisé avec le propriétaire.</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Ce bail est {label(lease.status).toLowerCase()} — le préavis n&apos;est plus nécessaire.</p>
              )}
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold"><Star className="size-4 text-primary" aria-hidden /> Avis après location</h3>
              {terminated ? (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">Partagez votre expérience : votre avis aide les futurs locataires.</p>
                  <Button className="mt-3 w-full" onClick={() => setReviewOpen(true)}>Laisser mon avis</Button>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Cet avis sera disponible à la fin de votre location.</p>
              )}
            </div>
          </section>

          {/* Bailleur */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft" aria-label="Votre bailleur">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold"><Users className="size-4 text-primary" aria-hidden /> Votre bailleur</h3>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold">{lease.owner.fullName}</p>
              <KycBadge status={lease.owner.kycStatus} />
              {lease.owner.phone && (
                <a href={`tel:${lease.owner.phone}`} className="text-sm font-medium text-primary hover:underline">{lease.owner.phone}</a>
              )}
            </div>
          </section>

          {/* Échéancier complet */}
          <section className="rounded-2xl border bg-card shadow-soft" aria-label="Échéancier de loyer">
            <div className="flex items-center justify-between p-4 pb-2 sm:px-6">
              <h3 className="flex items-center gap-2 font-display text-base font-bold"><ReceiptText className="size-4 text-primary" aria-hidden /> Échéancier de loyer</h3>
            </div>
            {schedules.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">Aucune échéance générée pour ce bail.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-semibold sm:px-6">Échéance</th>
                      <th className="px-4 py-2 font-semibold">Montant</th>
                      <th className="px-4 py-2 font-semibold">Statut</th>
                      <th className="px-4 py-2 text-right font-semibold sm:px-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schedules.map((s) => {
                      const payPending = !terminated && (s.status === "PENDING" || s.status === "LATE" || s.status === "PARTIAL");
                      return (
                        <tr key={s.id} className={cn(s.status === "LATE" && "bg-red-50/60 dark:bg-red-950/20")}>
                          <td className="px-4 py-3 font-medium sm:px-6">{formatDate(s.dueDate)}</td>
                          <td className="px-4 py-3">{formatFcfa(s.amount - s.paidAmount)}{s.paidAmount > 0 && s.status !== "PAID" && <span className="ml-1 text-xs text-muted-foreground">(sur {formatFcfa(s.amount)})</span>}</td>
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                          <td className="px-4 py-3 text-right sm:px-6">
                            {payPending ? (
                              <Button size="sm" className="min-h-[40px]" onClick={() => setPaySchedule(s)}>Payer</Button>
                            ) : s.status === "PAID" && s.quittanceUrl ? (
                              <a href={s.quittanceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5">
                                Quittance
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Dialogues */}
      <PaymentDialog
        open={Boolean(paySchedule)}
        onClose={() => setPaySchedule(null)}
        makePayment={makeSchedulePayment}
        onSuccess={refreshAll}
        title="Paiement de loyer"
      />
      <PaymentDialog
        open={initialOpen}
        onClose={() => setInitialOpen(false)}
        makePayment={makeInitialPayment}
        onSuccess={refreshAll}
        title="Paiement d'entrée"
      />

      <Dialog open={signOpen} onOpenChange={(v) => { if (!v && !busy) setSignOpen(false); }}>
        <DialogContent className="max-w-lg" aria-describedby="sign-desc">
          <DialogHeader>
            <DialogTitle>Signature du contrat de bail</DialogTitle>
            <DialogDescription id="sign-desc">
              Dessinez votre signature ci-dessous. Elle sera horodatée et archivée avec le contrat.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad onChange={setSignature} />
          <Button className="h-11 w-full" disabled={!signature || busy} onClick={() => void submitSignature()}>
            {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Enregistrement…</> : "Valider ma signature"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={(v) => { if (!v && !busy) setReviewOpen(false); }}>
        <DialogContent className="max-w-md" aria-describedby="review-desc">
          <DialogHeader>
            <DialogTitle>Votre avis sur le logement</DialogTitle>
            <DialogDescription id="review-desc">
              Une note de 1 à 5 étoiles et, si vous le souhaitez, un commentaire.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                className="grid size-11 place-items-center rounded-lg hover:bg-secondary/60"
              >
                <Star className={cn("size-7", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Propriétaire réactif, logement conforme aux photos…" rows={4}
            aria-label="Commentaire"
            maxLength={1000}
          />
          <Button className="h-11 w-full" disabled={busy} onClick={() => void submitReview()}>
            {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Envoi…</> : "Publier mon avis"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
