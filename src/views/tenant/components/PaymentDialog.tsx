"use client";

// ============================================================
// LocaBénin — Espace Locataire : dialogue de paiement Mobile Money
// Contrat : { open, onClose, makePayment } — l'appelant effectue le
// POST /api/payments/initiate et renvoie l'intention (référence + code
// simulateur). Le dialogue gère : choix méthode → simulateur « Code
// Mobile Money » → confirmation → polling statut → succès / échec.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Smartphone, CreditCard, Loader2, CheckCircle2, XCircle, ExternalLink,
  ShieldCheck, Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiSend, apiGet, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import type { PaymentIntent } from "../api";

const METHODS = [
  { code: "MTN_MOMO", icon: Smartphone, hint: "MTN MoMo" },
  { code: "MOOV_MONEY", icon: Smartphone, hint: "Moov Money" },
  { code: "CELTIS_CASH", icon: Smartphone, hint: "Celtiis Cash" },
  { code: "CARD", icon: CreditCard, hint: "Carte bancaire" },
] as const;

type Step = "method" | "confirm" | "processing" | "success" | "failed";

interface StatusPayload {
  id: string;
  reference: string;
  amount: number;
  status: string;
  purpose: string;
  method: string;
  confirmedAt: string | null;
  breakdownJson: string | null;
}

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Lance le paiement pour la méthode choisie (l'appelant fait POST /api/payments/initiate). */
  makePayment: (method: string) => Promise<PaymentIntent>;
  /** Appelé après un paiement réussi (rafraîchissement des données de l'appelant). */
  onSuccess?: () => void;
  title?: string;
}

export function PaymentDialog({ open, onClose, makePayment, onSuccess, title = "Paiement sécurisé" }: PaymentDialogProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<string>("MTN_MOMO");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [finalPayment, setFinalPayment] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Réinitialisation à chaque ouverture
  useEffect(() => {
    if (open) {
      setStep("method");
      setMethod("MTN_MOMO");
      setIntent(null);
      setFinalPayment(null);
      setBusy(false);
    }
  }, [open]);

  async function guard401<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        navigate("/connexion", { replace: true });
        throw e;
      }
      throw e;
    }
  }

  async function chooseAndPay(code: string) {
    setMethod(code);
    setBusy(true);
    try {
      const intent = await guard401(() => makePayment(code));
      if (!alive.current) return;
      setIntent(intent);
      setStep("confirm");
    } catch (e) {
      if (!alive.current) return;
      toast.error(e instanceof Error ? e.message : "Paiement impossible pour le moment.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function confirmOutcome(outcome: "succeeded" | "failed") {
    if (!intent) return;
    setBusy(true);
    setStep("processing");
    try {
      await guard401(() => apiSend("/api/payments/mock-confirm", "POST", { reference: intent.reference, outcome }));
      // Polling léger : la source de vérité reste /api/payments/status
      let last: StatusPayload | null = null;
      for (let i = 0; i < 8; i++) {
        if (!alive.current) return;
        await new Promise((r) => setTimeout(r, 1100));
        last = await guard401(() => apiGet<StatusPayload>(`/api/payments/status?reference=${encodeURIComponent(intent.reference)}`));
        if (last && (last.status === "SUCCESS" || last.status === "FAILED")) break;
      }
      if (!alive.current) return;
      if (last?.status === "SUCCESS") {
        setFinalPayment(last);
        setStep("success");
        qc.invalidateQueries({ queryKey: ["payments-history"] });
        qc.invalidateQueries({ queryKey: ["leases"] });
        onSuccess?.();
      } else {
        setFinalPayment(last);
        setStep("failed");
      }
    } catch (e) {
      if (!alive.current) return;
      toast.error(e instanceof Error ? e.message : "Confirmation impossible.");
      setStep("confirm");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const breakdown = intent?.breakdown ?? [];
  const quittanceUrl = finalPayment ? `/api/pdf/quittance/${finalPayment.id}` : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="payment-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription id="payment-desc">
            Paiement traité via un agrégateur Mobile Money béninois (simulation démo).
          </DialogDescription>
        </DialogHeader>

        {step === "method" && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Choisissez votre moyen de paiement</legend>
              {METHODS.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => setMethod(m.code)}
                  aria-pressed={method === m.code}
                  className={cn(
                    "flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                    method === m.code ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary/60",
                  )}
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", method === m.code ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                    <m.icon className="size-4.5" aria-hidden />
                  </span>
                  {label(m.code)}
                </button>
              ))}
            </fieldset>
            <Button className="h-11 w-full text-base" disabled={busy} onClick={() => void chooseAndPay(method)}>
              {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Initialisation…</> : "Payer"}
            </Button>
          </div>
        )}

        {step === "confirm" && intent && (
          <div className="space-y-4">
            {breakdown.length > 0 && (
              <div className="rounded-xl border bg-secondary/40 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Détail du paiement</p>
                {breakdown.map((l) => (
                  <div key={l.label} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="font-medium">{formatFcfa(l.amount)}</span>
                  </div>
                ))}
                <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-sm font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatFcfa(intent.amount)}</span>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-dashed p-4 text-center">
              <p className="text-xs text-muted-foreground">Référence du paiement</p>
              <p className="font-mono text-sm font-semibold">{intent.reference}</p>
              <p className="mt-3 text-xs text-muted-foreground">Code de confirmation Mobile Money</p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{intent.mockConfirmToken ?? "······"}</p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5" aria-hidden />
                Mode démo : le code s&apos;affiche directement au lieu d&apos;arriver par SMS.
              </p>
            </div>
            <Button className="h-11 w-full text-base" disabled={busy} onClick={() => void confirmOutcome("succeeded")}>
              Confirmer le paiement — {formatFcfa(intent.amount)}
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={busy} onClick={() => void confirmOutcome("failed")}>
              Simuler un échec de paiement (démo)
            </Button>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
            <p className="font-medium">Vérification du paiement…</p>
            <p className="text-sm text-muted-foreground">Ne fermez pas cette fenêtre, cela prend quelques secondes.</p>
          </div>
        )}

        {step === "success" && finalPayment && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="size-14 text-emerald-600" aria-hidden />
            <p className="font-display text-xl font-bold">Paiement réussi</p>
            <p className="text-sm text-muted-foreground">
              {formatFcfa(finalPayment.amount)} — {label(finalPayment.purpose)}
            </p>
            <Badge className="bg-emerald-100 text-emerald-800 border-0">{label(finalPayment.status)}</Badge>
            <p className="font-mono text-xs text-muted-foreground">{finalPayment.reference}</p>
            {finalPayment.confirmedAt && (
              <p className="text-xs text-muted-foreground">Confirmé le {formatDate(finalPayment.confirmedAt, true)}</p>
            )}
            {quittanceUrl && (
              <a
                href={quittanceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
              >
                Voir la quittance <ExternalLink className="size-4" aria-hidden />
              </a>
            )}
            <Button className="mt-2 w-full" onClick={onClose}>Terminer</Button>
          </div>
        )}

        {step === "failed" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="size-14 text-red-600" aria-hidden />
            <p className="font-display text-xl font-bold">Paiement échoué</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {finalPayment?.status === "FAILED"
                ? "L'opérateur a rejeté la transaction. Aucun montant n'a été débité."
                : "Le paiement n'a pas pu être confirmé. Vérifiez votre solde puis réessayez."}
            </p>
            <Button className="mt-2 w-full" onClick={() => { setStep("method"); setIntent(null); }}>
              Réessayer
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>Fermer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
