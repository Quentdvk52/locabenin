"use client";

// ============================================================
// LocaBénin — Dialogue de paiement Mobile Money (local à l'espace
// propriétaire, contrat identique au module locataire) :
//   1. choix de la méthode → makePayment(method) (initiation côté API)
//   2. simulateur agrégateur (sandbox) : réussite / échec
//   3. confirmation via /api/payments/mock-confirm (vrai pipeline webhook)
// ============================================================

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Smartphone, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatFcfa } from "@/lib/finance";
import { apiSend } from "@/lib/client/session";
import { handleApiError } from "./helpers";

export type PaymentMethod = "MTN_MOMO" | "MOOV_MONEY" | "CELTIS_CASH" | "CARD";

const METHODS: Array<{ code: PaymentMethod; name: string; hint: string }> = [
  { code: "MTN_MOMO", name: "MTN MoMo", hint: "+229 01 97 …" },
  { code: "MOOV_MONEY", name: "Moov Money", hint: "+229 01 94 …" },
  { code: "CELTIS_CASH", name: "Celtiis Cash", hint: "+229 01 40 …" },
  { code: "CARD", name: "Carte bancaire", hint: "Visa / Mastercard" },
];

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titre affiché en haut du dialogue (ex. « Facture d'abonnement ») */
  title: string;
  /** Description courte (ex. période facturée) */
  description?: string;
  /** Montant à payer (FCFA entier) — affiché, jamais envoyé au serveur */
  amount: number;
  /**
   * Initie le paiement pour la méthode choisie et renvoie la référence +
   * le jeton du simulateur (contrat identique au module locataire).
   */
  makePayment: (method: PaymentMethod) => Promise<{ reference: string; mockConfirmToken?: string }>;
  /** Appelé après une confirmation réussie (invalidation des requêtes) */
  onSuccess?: () => void;
}

type Step = "method" | "simulator" | "done" | "failed";

export function PaymentDialog({ open, onOpenChange, title, description, amount, makePayment, onSuccess }: PaymentDialogProps) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod>("MTN_MOMO");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("method");
    setReference(null);
    setBusy(false);
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  async function start() {
    setBusy(true);
    try {
      const res = await makePayment(method);
      setReference(res.reference);
      setStep("simulator");
    } catch (e) {
      handleApiError(e, "Échec de l'initialisation du paiement.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(outcome: "succeeded" | "failed") {
    if (!reference) return;
    setBusy(true);
    try {
      await apiSend("/api/payments/mock-confirm", "POST", { reference, outcome });
      if (outcome === "succeeded") {
        setStep("done");
        toast.success(`Paiement de ${formatFcfa(amount)} confirmé.`);
        onSuccess?.();
      } else {
        setStep("failed");
        toast.error("Paiement refusé par l'opérateur.");
      }
    } catch (e) {
      handleApiError(e, "Échec de la confirmation du paiement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {step === "method" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="size-5 text-primary" aria-hidden />
                {title}
              </DialogTitle>
              <DialogDescription>{description ?? "Choisissez votre moyen de paiement."}</DialogDescription>
            </DialogHeader>
            <p className="font-display text-3xl font-bold text-primary">{formatFcfa(amount)}</p>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} className="gap-2">
              {METHODS.map((m) => (
                <Label
                  key={m.code}
                  htmlFor={`pay-${m.code}`}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                  <RadioGroupItem id={`pay-${m.code}`} value={m.code} />
                </Label>
              ))}
            </RadioGroup>
            {method !== "CARD" && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-phone" className="text-sm">Numéro à débiter</Label>
                <Input
                  id="pay-phone"
                  inputMode="tel"
                  placeholder="+229 01 97 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}
            <Button onClick={() => void start()} disabled={busy} className="h-11 w-full text-base">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              Payer {formatFcfa(amount)}
            </Button>
          </>
        )}

        {step === "simulator" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirmation opérateur</DialogTitle>
              <DialogDescription>
                Une demande de débit a été envoyée sur votre téléphone (réf. {reference}). En mode démo, confirmez le résultat ci-dessous.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Montant à débiter</p>
              <p className="font-display text-2xl font-bold">{formatFcfa(amount)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="destructive" onClick={() => void confirm("failed")} disabled={busy} className="h-11">
                <XCircle className="size-4" aria-hidden /> Simuler l&apos;échec
              </Button>
              <Button onClick={() => void confirm("succeeded")} disabled={busy} className="h-11">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
                Simuler la réussite
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-14 text-emerald-600" aria-hidden />
            <h3 className="font-display text-lg font-bold">Paiement confirmé</h3>
            <p className="text-sm text-muted-foreground">{formatFcfa(amount)} — merci !</p>
            <Button onClick={() => close(false)} className="mt-2">Fermer</Button>
          </div>
        )}

        {step === "failed" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="size-14 text-red-600" aria-hidden />
            <h3 className="font-display text-lg font-bold">Paiement refusé</h3>
            <p className="text-sm text-muted-foreground">Le paiement n&apos;a pas abouti. Vous pouvez réessayer avec une autre méthode.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={reset}>Réessayer</Button>
              <Button variant="ghost" onClick={() => close(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
