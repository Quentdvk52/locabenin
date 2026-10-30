"use client";

// ============================================================
// LocaBénin — Dialog de paiement Mobile Money (flux complet)
// 1. Choix de la méthode (MTN MoMo / Moov Money / Celtiis Cash / Carte)
// 2. makePayment(method) → initiate → { reference, mockConfirmToken }
// 3. Simulateur sandbox (si token) : « Entrez votre code Mobile Money »
//    → POST /api/payments/mock-confirm
// 4. Polling GET /api/payments/status (max 10 tentatives) → succès/échec
// Réutilisable tel quel : le parent ne fournit que makePayment().
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Smartphone, Wallet, Coins, CreditCard, Loader2, ShieldCheck, CircleCheck, CircleAlert, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFcfa } from "@/lib/finance";
import { label, type PaymentMethod } from "@/lib/constants";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Montant à régler, en FCFA (affiché uniquement ; recalculé côté serveur). */
  amount: number;
  /** Intitulé affiché (ex. « Réservation RES-XXX »). */
  description?: string;
  /** Déclenche l'initiation côté serveur et renvoie la référence + token simulateur. */
  makePayment: (method: PaymentMethod) => Promise<{ reference: string; mockConfirmToken: string | null }>;
  /** Appelé quand le paiement passe en SUCCESS. */
  onPaid?: (reference: string) => void;
}

const METHODS: Array<{ code: PaymentMethod; icon: typeof Smartphone; hint: string }> = [
  { code: "MTN_MOMO", icon: Smartphone, hint: "MTN MoMo — 01 66 / 01 61 / 01 60" },
  { code: "MOOV_MONEY", icon: Wallet, hint: "Moov Money — 01 94 / 01 95 / 01 96" },
  { code: "CELTIS_CASH", icon: Coins, hint: "Celtiis Cash — 01 50" },
  { code: "CARD", icon: CreditCard, hint: "Visa / Mastercard (test)" },
];

type Step = "method" | "processing" | "confirm" | "waiting" | "success" | "error";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_TRIES = 10;

async function pollStatus(reference: string): Promise<"SUCCESS" | "FAILED" | "TIMEOUT"> {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const p = await apiGet<{ status: string } | null>(`/api/payments/status?reference=${encodeURIComponent(reference)}`);
      if (p?.status === "SUCCESS") return "SUCCESS";
      if (p?.status === "FAILED") return "FAILED";
    } catch {
      // erreur réseau passagère : on retente jusqu'à épuisement
    }
  }
  return "TIMEOUT";
}

export function PaymentDialog({ open, onClose, amount, description, makePayment, onPaid }: PaymentDialogProps) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod>("MTN_MOMO");
  const [reference, setReference] = useState<string | null>(null);
  const [mockToken, setMockToken] = useState<string | null>(null);
  const [momoCode, setMomoCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const busyRef = useRef(false);

  // Réinitialisation complète à chaque ouverture.
  useEffect(() => {
    if (open) {
      setStep("method");
      setMethod("MTN_MOMO");
      setReference(null);
      setMockToken(null);
      setMomoCode("");
      setErrorMsg("");
      busyRef.current = false;
    }
  }, [open]);

  function handleAuthError(e: unknown) {
    if (e instanceof ApiClientError && e.status === 401) {
      toast.error("Connectez-vous pour effectuer ce paiement.");
      navigate("/connexion");
      onClose();
      return true;
    }
    return false;
  }

  async function pay() {
    if (busyRef.current) return;
    busyRef.current = true;
    setStep("processing");
    setErrorMsg("");
    try {
      const { reference: ref, mockConfirmToken } = await makePayment(method);
      setReference(ref);
      if (mockConfirmToken) {
        setMockToken(mockConfirmToken);
        setStep("confirm");
      } else {
        // Agrégateur réel : pas de simulateur, on attend le webhook.
        setStep("waiting");
        const outcome = await pollStatus(ref);
        if (outcome === "SUCCESS") {
          setStep("success");
          onPaid?.(ref);
        } else {
          setErrorMsg(outcome === "FAILED" ? "Le paiement a été refusé par votre opérateur." : "Le paiement est toujours en attente. Réessayez dans quelques instants depuis votre historique.");
          setStep("error");
        }
      }
    } catch (e) {
      if (!handleAuthError(e)) {
        setErrorMsg(e instanceof ApiClientError ? e.message : "Impossible de démarrer le paiement.");
        setStep("error");
      }
    } finally {
      busyRef.current = false;
    }
  }

  async function confirmMock(outcome: "succeeded" | "failed") {
    if (!reference) return;
    busyRef.current = true;
    setStep("waiting");
    try {
      await apiSend("/api/payments/mock-confirm", "POST", { reference, outcome });
      const result = await pollStatus(reference);
      if (result === "SUCCESS") {
        setStep("success");
        toast.success("Paiement effectué avec succès");
        onPaid?.(reference);
      } else {
        setErrorMsg(result === "FAILED" ? "Paiement refusé : vérifiez votre solde puis réessayez." : "Le paiement est toujours en attente de confirmation.");
        setStep("error");
      }
    } catch (e) {
      if (!handleAuthError(e)) {
        setErrorMsg(e instanceof ApiClientError ? e.message : "Confirmation impossible.");
        setStep("error");
      }
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" aria-describedby="payment-dialog-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Paiement sécurisé
          </DialogTitle>
          <DialogDescription id="payment-dialog-desc">
            {description ?? "Réglez votre paiement en toute sécurité — quittance automatique."}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-xl bg-primary/5 px-4 py-3 text-center font-display text-2xl font-bold text-primary">
          {formatFcfa(amount)}
        </p>

        {step === "method" && (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Choisissez votre moyen de paiement</legend>
              {METHODS.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => setMethod(m.code)}
                  aria-pressed={method === m.code}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    method === m.code ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-secondary/60",
                  )}
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", method === m.code ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                    <m.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label(m.code)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                </button>
              ))}
            </fieldset>
            <Button className="w-full" size="lg" onClick={() => void pay()}>
              Payer {formatFcfa(amount)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Paiement séquestre : les fonds sont versés au bénéficiaire après validation. Aucun paiement hors plateforme.
            </p>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center gap-3 py-8" role="status">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">Initialisation du paiement {label(method)}…</p>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed bg-secondary/50 p-4 text-center">
              <p className="text-sm font-medium">Simulateur Mobile Money (démo)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sur votre téléphone, vous saisiriez votre code secret {label(method)} pour valider {formatFcfa(amount)}.
              </p>
              <Input
                value={momoCode}
                onChange={(e) => setMomoCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Code à 4 chiffres (démo : n'importe lequel)"
                inputMode="numeric"
                className="mt-3 text-center tracking-[0.5em]"
                aria-label="Code de confirmation Mobile Money"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void confirmMock("failed")}>
                Simuler un échec
              </Button>
              <Button onClick={() => void confirmMock("succeeded")}>Confirmer le paiement</Button>
            </div>
          </div>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center gap-3 py-8" role="status">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium">Confirmation en cours…</p>
            <p className="text-center text-xs text-muted-foreground">
              Référence {reference ?? "—"} — ne fermez pas cette fenêtre.
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CircleCheck className="size-12 text-emerald-600" aria-hidden />
            <p className="font-display text-lg font-bold">Paiement réussi</p>
            <p className="text-sm text-muted-foreground">
              {formatFcfa(amount)} réglés. Votre quittance est disponible dans votre historique de paiements.
            </p>
            <Button className="mt-2 w-full" onClick={onClose}>Terminer</Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CircleAlert className="size-12 text-destructive" aria-hidden />
            <p className="font-display text-lg font-bold">Paiement non abouti</p>
            <p className="text-sm text-muted-foreground">{errorMsg || "Une erreur est survenue."}</p>
            <Button variant="outline" className="mt-2 w-full" onClick={() => setStep("method")}>
              <RefreshCw className="mr-2 size-4" aria-hidden /> Réessayer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
