"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : portefeuille & retraits
// Solde (ledger), relevé d'écritures, historique de retraits,
// retrait Mobile Money avec OTP (mode démo : le code s'affiche).
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, ArrowDownLeft, ArrowUpRight, ShieldAlert, Loader2, Info,
  Smartphone, ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { MoneyInput } from "@/components/shared/form-bits";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { guardedGet, guardedSend, mutationError, type PayoutData } from "./api";

const METHODS = ["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH"] as const;

export function AgentWallet() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<string>("MTN_MOMO");
  const [destination, setDestination] = useState("");
  const [step, setStep] = useState<"form" | "otp" | "done">("form");
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ status: string; autoProcessed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const data = useQuery({
    queryKey: ["payouts"],
    queryFn: () => guardedGet<PayoutData>("/api/payouts"),
  });

  const balance = data.data?.agentBalance ?? 0;
  const min = data.data?.settings.min ?? 2000;
  const autoThreshold = data.data?.settings.autoThreshold ?? 50000;
  const statement = data.data?.statements.AGENT ?? [];
  const myPayouts = (data.data?.payouts ?? []).filter((p) => p.userRole === "AGENT");

  function resetDialog() {
    setAmount("");
    setMethod("MTN_MOMO");
    setDestination(user?.whatsapp ?? "");
    setStep("form");
    setPayoutId(null);
    setDevCode(null);
    setCode("");
    setResult(null);
  }

  async function requestWithdraw() {
    const amt = typeof amount === "number" ? amount : 0;
    if (amt < min) {
      toast.error(`Retrait minimum : ${formatFcfa(min)}.`);
      return;
    }
    if (amt > balance) {
      toast.error("Montant supérieur à votre solde disponible.");
      return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(destination.trim())) {
      toast.error("Numéro Mobile Money invalide (8 à 15 chiffres).");
      return;
    }
    setBusy(true);
    try {
      const created = await guardedSend<{ payoutId: string }>("/api/payouts", "POST", {
        amount: amt, method, destination: destination.trim(), role: "AGENT",
      });
      setPayoutId(created.payoutId);
      const otp = await guardedSend<{ devCode: string }>("/api/payouts?action=send", "PUT", { payoutId: created.payoutId });
      setDevCode(otp.devCode);
      setStep("otp");
    } catch (e) {
      toast.error(mutationError(e, "Demande impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!payoutId) return;
    setBusy(true);
    try {
      const res = await guardedSend<{ status: string; autoProcessed: boolean }>("/api/payouts?action=verify", "PUT", { payoutId, code });
      setResult(res);
      setStep("done");
      if (res.autoProcessed) {
        toast.success(`Retrait de ${formatFcfa(typeof amount === "number" ? amount : 0)} traité automatiquement !`);
      } else {
        toast.info("Demande envoyée — en attente de validation par l'administration.");
      }
      void qc.invalidateQueries({ queryKey: ["payouts"] });
    } catch (e) {
      toast.error(mutationError(e, "Vérification impossible."));
    } finally {
      setBusy(false);
    }
  }

  const kycOk = user?.kycStatus === "VERIFIED";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Portefeuille &amp; retraits</h2>
        <p className="text-sm text-muted-foreground">Vos commissions disponibles, votre relevé et vos retraits Mobile Money.</p>
      </div>

      {/* Alerte KYC */}
      {!kycOk && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/30" aria-label="KYC requis">
          <ShieldAlert className="size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            <strong>Vérification d&apos;identité requise.</strong> Le KYC est obligatoire avant tout retrait de vos commissions.
          </p>
          <Button className="min-h-[44px]" onClick={() => navigate("/compte")}>Vérifier mon identité</Button>
        </section>
      )}

      {data.isLoading && <RowsSkeleton rows={4} />}
      {data.isError && <ErrorState message="Impossible de charger votre portefeuille." onRetry={() => void data.refetch()} />}

      {data.data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Solde + retrait */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Solde disponible">
            <h3 className="flex items-center gap-2 font-display text-base font-bold"><Wallet className="size-5 text-primary" aria-hidden /> Solde disponible</h3>
            <p className="mt-2 font-display text-4xl font-bold text-primary">{formatFcfa(balance)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Retrait minimum : {formatFcfa(min)} · au-delà de {formatFcfa(autoThreshold)}, validation manuelle par l&apos;administration.
            </p>
            <Button
              size="lg"
              className="mt-4 min-h-[48px] w-full text-base"
              disabled={!kycOk || balance < min}
              onClick={() => { resetDialog(); setWithdrawOpen(true); }}
            >
              <Smartphone className="size-5" aria-hidden /> Retirer vers Mobile Money
            </Button>
            {!kycOk && <p className="mt-2 text-xs text-muted-foreground">Débloqué après vérification d&apos;identité (KYC).</p>}
          </section>

          {/* Relevé */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft lg:col-span-2" aria-label="Relevé du portefeuille">
            <h3 className="flex items-center gap-2 font-display text-base font-bold"><ReceiptText className="size-5 text-primary" aria-hidden /> Relevé des écritures</h3>
            {statement.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aucune écriture pour l&apos;instant — vos commissions créditées apparaîtront ici.</p>
            ) : (
              <ul className="styled-scroll mt-3 max-h-80 divide-y overflow-y-auto pr-1">
                {statement.map((e) => {
                  const credit = e.direction === "CREDIT";
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", credit ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")}>
                          {credit ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.memo}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(e.createdAt, true)}</p>
                        </div>
                      </div>
                      <p className={cn("shrink-0 text-sm font-bold", credit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                        {credit ? "+" : "−"}{formatFcfa(e.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Historique retraits */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft lg:col-span-3" aria-label="Historique des retraits">
            <h3 className="font-display text-base font-bold">Historique des retraits</h3>
            {myPayouts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aucun retrait demandé pour le moment.</p>
            ) : (
              <ul className="mt-3 divide-y">
                {myPayouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{formatFcfa(p.amount)} — {label(p.method)} <span className="font-mono text-xs text-muted-foreground">{p.destination}</span></p>
                      <p className="text-xs text-muted-foreground">
                        Demandé le {formatDate(p.createdAt, true)}
                        {p.processedAt ? ` · traité le ${formatDate(p.processedAt, true)}` : ""}
                        {p.rejectionReason ? ` · motif : ${p.rejectionReason}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Dialogue de retrait */}
      <Dialog open={withdrawOpen} onOpenChange={(v) => { if (!v && !busy) setWithdrawOpen(false); }}>
        <DialogContent className="max-w-md" aria-describedby="withdraw-desc">
          <DialogHeader>
            <DialogTitle>Retrait vers Mobile Money</DialogTitle>
            <DialogDescription id="withdraw-desc">
              Solde disponible : <strong>{formatFcfa(balance)}</strong> — minimum {formatFcfa(min)}.
            </DialogDescription>
          </DialogHeader>

          {step === "form" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-amount">Montant</Label>
                <MoneyInput value={amount} onChange={setAmount} ariaLabel="Montant du retrait en FCFA" />
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAmount(min)}>Min ({formatFcfa(min)})</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAmount(balance)}>Tout ({formatFcfa(balance)})</Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Opérateur</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-11 w-full" aria-label="Opérateur Mobile Money"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m} value={m}>{label(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-dest">Numéro Mobile Money</Label>
                <Input
                  id="w-dest" value={destination} onChange={(e) => setDestination(e.target.value)}
                  placeholder="+229 01 97 00 00 00" inputMode="tel" className="h-11"
                />
              </div>
              {typeof amount === "number" && amount > autoThreshold && (
                <p className="flex items-start gap-1.5 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Au-delà de {formatFcfa(autoThreshold)}, votre demande sera validée manuellement par l&apos;administration (sous 24-48 h ouvrées).
                </p>
              )}
              <Button className="h-11 w-full" disabled={busy || !amount} onClick={() => void requestWithdraw()}>
                {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Traitement…</> : "Demander le retrait"}
              </Button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Un code de confirmation à 6 chiffres a été envoyé au <strong>{destination}</strong>.
              </p>
              {devCode && (
                <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
                  Mode démo : votre code est <span className="font-mono text-lg font-bold tracking-widest text-primary">{devCode}</span>
                </p>
              )}
              <Input
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Code à 6 chiffres" inputMode="numeric" className="h-12 text-center font-mono text-lg tracking-widest"
                aria-label="Code de confirmation OTP" maxLength={6}
              />
              <Button className="h-11 w-full" disabled={busy || code.length !== 6} onClick={() => void verifyOtp()}>
                {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Vérification…</> : "Confirmer le retrait"}
              </Button>
            </div>
          )}

          {step === "done" && result && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {result.autoProcessed ? (
                <>
                  <span className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <Wallet className="size-7" aria-hidden />
                  </span>
                  <p className="font-display text-lg font-bold">Retrait traité !</p>
                  <p className="text-sm text-muted-foreground">{formatFcfa(typeof amount === "number" ? amount : 0)} envoyés vers {label(method)} ({destination}).</p>
                </>
              ) : (
                <>
                  <span className="grid size-14 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                    <Info className="size-7" aria-hidden />
                  </span>
                  <p className="font-display text-lg font-bold">Demande enregistrée</p>
                  <p className="text-sm text-muted-foreground">
                    Montant au-delà du seuil automatique : l&apos;administration validera votre retrait sous 24-48 h ouvrées.
                  </p>
                </>
              )}
              <Button className="mt-2 w-full" onClick={() => setWithdrawOpen(false)}>Terminer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
