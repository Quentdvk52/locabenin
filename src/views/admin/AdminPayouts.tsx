"use client";

// ============================================================
// LocaBénin — AdminPayouts : retraits Mobile Money
// Cards utilisateur + montant + destination, approuver (→
// completePayout, écriture ledger idempotente) / rejeter (motif).
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Check, X, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminError, PageIntro, initials } from "./components/bits";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AdminPayout {
  id: string;
  amount: number;
  method: string;
  destination: string;
  status: string;
  otpVerified: boolean;
  rejectionReason: string | null;
  createdAt: string;
  processedAt: string | null;
  user: { id: string; fullName: string; phone: string | null; kycStatus: string; role: string; roles: string[] };
}

interface PayoutsData {
  items: AdminPayout[];
  total: number;
  settings: { autoThreshold: number; minAmount: number };
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  AGENT: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
};

const PAYOUT_KEY = ["admin", "payouts"] as const;

export default function AdminPayouts() {
  const [status, setStatus] = useState("PENDING_QUEUE");
  const [rejectTarget, setRejectTarget] = useState<AdminPayout | null>(null);
  const [reason, setReason] = useState("");
  const [approveTarget, setApproveTarget] = useState<AdminPayout | null>(null);
  const queryClient = useQueryClient();

  const payoutsQ = useQuery<PayoutsData>({
    queryKey: [...PAYOUT_KEY, status],
    queryFn: () =>
      apiGet<PayoutsData>(
        status === "PENDING_QUEUE"
          ? "/api/admin/payouts?status=REQUESTED"
          : status === "ALL"
            ? "/api/admin/payouts?status=ALL"
            : `/api/admin/payouts?status=${status}`,
      ),
    refetchInterval: 45_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PAYOUT_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject"; reason?: string }) => apiSend("/api/admin/payouts", "PATCH", vars),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "approve" ? "Retrait approuvé : paiement Mobile Money exécuté (écriture ledger enregistrée)" : "Retrait rejeté — notification envoyée");
      setRejectTarget(null);
      setApproveTarget(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  const items = payoutsQ.data?.items ?? [];
  const threshold = payoutsQ.data?.settings.autoThreshold ?? 50_000;
  const minAmount = payoutsQ.data?.settings.minAmount ?? 2_000;

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Retraits"
        description="Demandes de retrait vers Mobile Money. L'approbation exécute le paiement et écrit la sortie dans le ledger (partie double, idempotente)."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52" aria-label="Filtrer par statut">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING_QUEUE">File à approuver</SelectItem>
              <SelectItem value="ALL">Tous</SelectItem>
              <SelectItem value="PAID">{label("PAID")}</SelectItem>
              <SelectItem value="REJECTED">{label("REJECTED")}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          Retraits ≤ {formatFcfa(threshold)} : auto-approuvés après vérification OTP par l&apos;utilisateur (seuil paramétrable dans l&apos;onglet Paramétrage).
          Minimum de retrait : {formatFcfa(minAmount)}.
        </span>
      </div>

      {payoutsQ.isError && <AdminError error={payoutsQ.error} onRetry={() => void payoutsQ.refetch()} />}
      {payoutsQ.isLoading && <RowsSkeleton rows={4} />}
      {payoutsQ.data && items.length === 0 && (
        <EmptyState icon={Wallet} title="Aucun retrait" description="Aucune demande de retrait pour ce filtre." />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((p) => {
          const actionable = p.status === "REQUESTED" || p.status === "OTP_PENDING";
          return (
            <article key={p.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <header className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">{initials(p.user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.user.fullName}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`border-0 px-1.5 py-0 text-[10px] ${ROLE_BADGE[p.user.role] ?? "bg-muted"}`}>{label(p.user.role)}</Badge>
                    <span className="text-xs text-muted-foreground">{p.user.phone ?? "—"}</span>
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </header>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-secondary/60 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Montant</dt>
                  <dd className="font-display font-bold">{formatFcfa(p.amount)}</dd>
                </div>
                <div className="rounded-xl bg-secondary/60 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Destination</dt>
                  <dd className="truncate font-semibold">{label(p.method)} · {p.destination}</dd>
                </div>
              </dl>

              <p className="mt-2 text-xs text-muted-foreground">
                Demandé le {formatDate(p.createdAt, true)}
                {p.otpVerified ? " · OTP vérifié" : " · OTP non vérifié"}
                {p.processedAt ? ` · traité le ${formatDate(p.processedAt, true)}` : ""}
              </p>
              {p.rejectionReason && (
                <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Motif de rejet : {p.rejectionReason}</p>
              )}

              {actionable && (
                <footer className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={act.isPending}
                    onClick={() => setApproveTarget(p)}>
                    <Check className="size-4" aria-hidden /> Approuver
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => { setRejectTarget(p); setReason(""); }}>
                    <X className="size-4" aria-hidden /> Rejeter
                  </Button>
                </footer>
              )}
            </article>
          );
        })}
      </div>

      {/* Confirmation d'approbation */}
      <AlertDialog open={approveTarget !== null} onOpenChange={(open) => { if (!open) setApproveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approuver ce retrait ?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget && (
                <>
                  {formatFcfa(approveTarget.amount)} seront envoyés à {label(approveTarget.method)} ({approveTarget.destination}) au profit de {approveTarget.user.fullName}.
                  L&apos;opération est définitive et inscrite au ledger.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={act.isPending}
              onClick={() => approveTarget && act.mutate({ id: approveTarget.id, action: "approve" })}>
              {act.isPending && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />} Confirmer le paiement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rejet avec motif */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeter la demande de retrait</DialogTitle>
            <DialogDescription>
              {rejectTarget && `${formatFcfa(rejectTarget.amount)} — ${rejectTarget.user.fullName}. Le montant reste disponible sur le portefeuille de l'utilisateur.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Motif du rejet (obligatoire, communiqué à l'utilisateur)" aria-label="Motif du rejet" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button>
            <Button variant="destructive" disabled={act.isPending || reason.trim().length < 3}
              onClick={() => rejectTarget && act.mutate({ id: rejectTarget.id, action: "reject", reason: reason.trim() })}>
              {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
