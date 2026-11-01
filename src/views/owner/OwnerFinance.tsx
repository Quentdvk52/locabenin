"use client";

// ============================================================
// LocaBénin — Finances propriétaire
// Portefeuille (ledger), retraits Mobile Money avec OTP, relevé,
// graphique d'encaissements 12 mois, paiements reçus + quittances,
// factures d'abonnement avec paiement intégré.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Wallet, ArrowDownToLine, Receipt, FileDown, CreditCard, Loader2, ShieldCheck, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { StatRow, MoneyInput, Timeline } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { PaymentDialog, type PaymentMethod } from "./components/PaymentDialog";
import { handleApiError, formatDateFr } from "./components/helpers";
import { cn } from "@/lib/utils";

interface StatementEntry { id: string; direction: string; amount: number; memo: string; createdAt: string }
interface PayoutRow { id: string; amount: number; method: string; destination: string; status: string; createdAt: string }
interface FinanceData {
  walletBalance: number;
  walletStatement: StatementEntry[];
  payouts: PayoutRow[];
  monthRevenue: number;
  revenueSeries: Array<{ key: string; label: string; total: number }>;
  receivedPayments: Array<{
    id: string; reference: string; purpose: string; amount: number; method: string; status: string;
    createdAt: string; confirmedAt: string | null; payer: { fullName: string }; leaseReference: string | null;
    listingTitle: string | null; quittanceUrl: string | null;
  }>;
  payoutSettings: { min: number; autoThreshold: number };
}
interface InvoiceRow {
  id: string; periodStart: string; periodEnd: string; amount: number; status: string;
  dueDate: string; graceUntil: string; paidAt: string | null;
}

const PAYOUT_METHODS = ["MTN_MOMO", "MOOV_MONEY", "CELTIS_CASH"] as const;
const METHOD_LABEL: Record<string, string> = { MTN_MOMO: "MTN MoMo", MOOV_MONEY: "Moov Money", CELTIS_CASH: "Celtiis Cash" };
const PURPOSE_LABEL: Record<string, string> = { INITIAL: "Paiement d'entrée", RENT: "Loyer", BOOKING: "Réservation", SUBSCRIPTION: "Abonnement", DEPOSIT_RETURN: "Restitution de caution" };

export default function OwnerFinance() {
  const qc = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);

  const finances = useQuery<FinanceData>({
    queryKey: ["owner", "finances"],
    queryFn: () => apiGet<FinanceData>("/api/owner/finances"),
  });
  const invoices = useQuery<InvoiceRow[]>({
    queryKey: ["subscription", "invoices"],
    queryFn: () => apiGet<InvoiceRow[]>("/api/subscription/invoices"),
  });

  const unpaidInvoice = useMemo(
    () => invoices.data?.find((i) => (i.status === "DUE" || i.status === "OVERDUE")) ?? null,
    [invoices.data],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["owner", "finances"] });
    void qc.invalidateQueries({ queryKey: ["subscription", "invoices"] });
    void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
  };

  async function paySubscription(method: PaymentMethod) {
    if (!payInvoice) throw new Error("Aucune facture sélectionnée.");
    const res = await apiSend<{ payment: { reference: string }; mockConfirmToken?: string; checkoutUrl?: string | null }>("/api/payments/initiate", "POST", {
      purpose: "SUBSCRIPTION",
      invoiceId: payInvoice.id,
      method,
    });
    return { reference: res.payment.reference, mockConfirmToken: res.mockConfirmToken, checkoutUrl: res.checkoutUrl };
  }

  if (finances.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <ViewHeader title="Finances" icon={Wallet} subtitle="Chargement…" />
        <RowsSkeleton rows={6} />
      </div>
    );
  }
  if (finances.isError || !finances.data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState
          message={finances.error instanceof Error ? finances.error.message : "Impossible de charger vos finances."}
          onRetry={() => void finances.refetch()}
        />
      </div>
    );
  }

  const d = finances.data;
  const maxRevenue = Math.max(1, ...d.revenueSeries.map((m) => m.total));
  const pendingPayouts = d.payouts.filter((p) => !["PAID", "REJECTED"].includes(p.status)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader title="Finances" subtitle="Portefeuille, encaissements et retraits" icon={Wallet} />

      {/* ---- Portefeuille ---- */}
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between" aria-label="Portefeuille">
        <div>
          <p className="text-sm text-muted-foreground">Solde disponible (portefeuille)</p>
          <p className="font-display text-4xl font-bold tracking-tight text-primary">{formatFcfa(d.walletBalance)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Revenus encaissés ce mois : {formatFcfa(d.monthRevenue)} · minimum de retrait : {formatFcfa(d.payoutSettings.min)}
            {pendingPayouts > 0 ? ` · ${pendingPayouts} retrait(s) en cours` : ""}
          </p>
        </div>
        <Button className="h-12 px-6 text-base" onClick={() => setWithdrawOpen(true)}>
          <ArrowDownToLine className="size-5" aria-hidden /> Retirer
        </Button>
      </section>

      <Tabs defaultValue="statement">
        <TabsList className="flex-wrap">
          <TabsTrigger value="statement">Relevé du portefeuille</TabsTrigger>
          <TabsTrigger value="encaissements">Paiements reçus</TabsTrigger>
          <TabsTrigger value="retraits">Retraits</TabsTrigger>
          <TabsTrigger value="factures">Factures d&apos;abonnement</TabsTrigger>
        </TabsList>

        {/* ---- Relevé ---- */}
        <TabsContent value="statement" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2" aria-label="Historique des mouvements">
              <h2 className="font-display text-base font-semibold">Derniers mouvements</h2>
              {d.walletStatement.length === 0 ? (
                <EmptyState className="mt-4" title="Aucun mouvement" description="Vos encaissements et retraits apparaîtront ici." icon={Wallet} />
              ) : (
                <div className="mt-4 max-h-96 overflow-y-auto pr-1">
                  <Timeline
                    items={d.walletStatement.slice(0, 12).map((e) => ({
                      title: `${e.direction === "CREDIT" ? "+" : "−"} ${formatFcfa(e.amount)}`,
                      description: e.memo,
                      time: formatDateFr(e.createdAt, true),
                      state: "done" as const,
                    }))}
                  />
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-3" aria-label="Encaissements 12 mois">
              <h2 className="font-display text-base font-semibold">Encaissements — 12 derniers mois</h2>
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.revenueSeries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={1} />
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
                      cursor={{ fill: "var(--muted)" }}
                    />
                    <Bar dataKey="total" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ---- Paiements reçus ---- */}
        <TabsContent value="encaissements">
          {d.receivedPayments.length === 0 ? (
            <EmptyState title="Aucun paiement reçu" description="Les paiements d'entrée et loyers de vos locataires apparaîtront ici." icon={Receipt} />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Objet</th>
                    <th className="px-4 py-3 font-medium">Locataire</th>
                    <th className="px-4 py-3 font-medium">Montant</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Quittance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.receivedPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateFr(p.confirmedAt ?? p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{PURPOSE_LABEL[p.purpose] ?? p.purpose}</p>
                        <p className="text-xs text-muted-foreground">{p.listingTitle ?? p.leaseReference ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">{p.payer?.fullName ?? "—"}</td>
                      <td className="px-4 py-3 font-display font-bold">{formatFcfa(p.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3">
                        {p.quittanceUrl ? (
                          <a href={p.quittanceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                            <FileDown className="size-3.5" aria-hidden /> PDF
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ---- Retraits ---- */}
        <TabsContent value="retraits">
          {d.payouts.length === 0 ? (
            <EmptyState
              title="Aucun retrait demandé"
              description={`Retirez votre solde vers Mobile Money (minimum ${formatFcfa(d.payoutSettings.min)}). Sous ${formatFcfa(d.payoutSettings.autoThreshold)}, le paiement est automatique.`}
              icon={ArrowDownToLine}
              actionLabel="Retirer maintenant"
              onAction={() => setWithdrawOpen(true)}
            />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Méthode</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Montant</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateFr(p.createdAt)}</td>
                      <td className="px-4 py-3">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="px-4 py-3">{p.destination}</td>
                      <td className="px-4 py-3 font-display font-bold">{formatFcfa(p.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ---- Factures ---- */}
        <TabsContent value="factures" className="space-y-3">
          {unpaidInvoice && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-500/10 p-4 dark:border-amber-900">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                Facture en attente : {formatFcfa(unpaidInvoice.amount)} — échéance le {formatDateFr(unpaidInvoice.dueDate)}
              </p>
              <Button size="sm" onClick={() => setPayInvoice(unpaidInvoice)} className="h-9">
                <CreditCard className="size-4" aria-hidden /> Payer
              </Button>
            </div>
          )}
          {invoices.isLoading ? (
            <RowsSkeleton rows={3} />
          ) : (invoices.data ?? []).length === 0 ? (
            <EmptyState title="Aucune facture" description="Les factures d'abonnement mensuelles apparaîtront ici." icon={Receipt} />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-medium">Période</th>
                    <th className="px-4 py-3 font-medium">Montant</th>
                    <th className="px-4 py-3 font-medium">Échéance</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">PDF</th>
                    <th className="px-4 py-3 font-medium sr-only">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(invoices.data ?? []).map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateFr(inv.periodStart)} → {formatDateFr(inv.periodEnd)}
                      </td>
                      <td className="px-4 py-3 font-display font-bold">{formatFcfa(inv.amount)}</td>
                      <td className="px-4 py-3">{formatDateFr(inv.dueDate)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3">
                        <a href={`/api/pdf/invoice/${inv.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <FileDown className="size-3.5" aria-hidden /> Facture
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {(inv.status === "DUE" || inv.status === "OVERDUE") && (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setPayInvoice(inv)}>Payer</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---- Dialog retrait ---- */}
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} balance={d.walletBalance} minAmount={d.payoutSettings.min} onDone={invalidate} />

      {/* ---- Dialog paiement facture ---- */}
      <PaymentDialog
        open={Boolean(payInvoice)}
        onOpenChange={(v) => !v && setPayInvoice(null)}
        title="Facture d'abonnement"
        description={payInvoice ? `Période du ${formatDateFr(payInvoice.periodStart)} au ${formatDateFr(payInvoice.periodEnd)}` : undefined}
        amount={payInvoice?.amount ?? 0}
        makePayment={paySubscription}
        onSuccess={() => {
          setPayInvoice(null);
          invalidate();
          toast.success("Abonnement réglé : vos offres restent publiées.");
        }}
      />
    </div>
  );
}

/** Retrait Mobile Money : demande → OTP (devCode en démo) → vérification. */
function WithdrawDialog({
  open, onOpenChange, balance, minAmount, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balance: number;
  minAmount: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<string>("MTN_MOMO");
  const [destination, setDestination] = useState("");
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("form");
    setAmount(0);
    setDestination("");
    setPayoutId(null);
    setDevCode(null);
    setCode("");
  };

  async function request() {
    if (amount < minAmount) {
      toast.error(`Retrait minimum : ${formatFcfa(minAmount)}.`);
      return;
    }
    if (amount > balance) {
      toast.error("Solde insuffisant sur votre portefeuille.");
      return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(destination.replace(/\s/g, ""))) {
      toast.error("Numéro Mobile Money invalide (ex. +2290197000000).");
      return;
    }
    setBusy(true);
    try {
      const created = await apiSend<{ payoutId: string }>("/api/payouts", "POST", {
        amount,
        method,
        destination: destination.replace(/\s/g, ""),
        role: "OWNER",
      });
      const sent = await apiSend<{ devCode?: string }>("/api/payouts?action=send", "PUT", { payoutId: created.payoutId });
      setPayoutId(created.payoutId);
      setDevCode(sent.devCode ?? null);
      setStep("otp");
      toast.info("Code de confirmation envoyé sur votre téléphone.");
    } catch (e) {
      handleApiError(e, "Demande de retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!payoutId) return;
    setBusy(true);
    try {
      const res = await apiSend<{ status: string; autoProcessed: boolean }>("/api/payouts?action=verify", "PUT", { payoutId, code });
      if (res.autoProcessed) {
        toast.success(`Retrait de ${formatFcfa(amount)} effectué vers ${METHOD_LABEL[method] ?? method}.`);
      } else {
        toast.success("Demande confirmée.", { description: "Votre retrait est en file de traitement par l'équipe." });
      }
      onDone();
      onOpenChange(false);
      setTimeout(reset, 200);
    } catch (e) {
      handleApiError(e, "Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowDownToLine className="size-5 text-primary" aria-hidden /> Retirer vers Mobile Money
              </DialogTitle>
              <DialogDescription>Solde disponible : {formatFcfa(balance)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Montant</Label>
                <MoneyInput value={amount} onChange={setAmount} ariaLabel="Montant du retrait" />
                <p className="text-xs text-muted-foreground">Minimum {formatFcfa(minAmount)} — sous 50 000 FCFA, le paiement est automatique.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wd-method">Méthode</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="wd-method" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYOUT_METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wd-dest">Numéro de réception</Label>
                <Input id="wd-dest" inputMode="tel" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="+229 01 97 00 00 00" className="h-11" />
              </div>
              <Button className="h-11 w-full" onClick={() => void request()} disabled={busy || amount <= 0}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
                Demander le retrait
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmation OTP</DialogTitle>
              <DialogDescription>
                Saisissez le code à 6 chiffres reçu par SMS{devCode ? ` (démo : ${devCode})` : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="••••••"
                aria-label="Code OTP"
                className="h-12 text-center font-display text-xl tracking-[0.4em]"
              />
              <Button className="h-11 w-full" onClick={() => void verify()} disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDownLeft className="size-4" aria-hidden />}
                Confirmer le retrait
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="size-3.5" aria-hidden /> {formatFcfa(amount)} vers {METHOD_LABEL[method] ?? method} ({destination})
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
