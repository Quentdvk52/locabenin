"use client";

// ============================================================
// LocaBénin — AdminCommissions : commissions démarcheurs
// Table : démarcheur, offre, parts (locataire/propriétaire/total),
// statut, validatableAt. Valider (après fenêtre anti-fraude) ou
// annuler (motif). Le paiement passe par les retraits.
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ShieldAlert, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdminError, PageIntro } from "./components/bits";

interface AdminCommission {
  id: string;
  agent: { id: string; fullName: string; phone: string | null; kycStatus: string };
  listing: { id: string; title: string; reference: string };
  leaseRef: string | null;
  tenantShare: number;
  ownerShare: number;
  total: number;
  status: string;
  validatableAt: string;
  validatedAt: string | null;
  paidAt: string | null;
  fraudFlag: string | null;
  createdAt: string;
}

const COMMISSIONS_KEY = ["admin", "commissions"] as const;

export default function AdminCommissions() {
  const [status, setStatus] = useState("ALL");
  const [cancelTarget, setCancelTarget] = useState<AdminCommission | null>(null);
  const [reason, setReason] = useState("");
  const [validateTarget, setValidateTarget] = useState<AdminCommission | null>(null);
  const queryClient = useQueryClient();

  const commissionsQ = useQuery({
    queryKey: [...COMMISSIONS_KEY, status],
    queryFn: () => apiGet<{ items: AdminCommission[]; total: number }>(`/api/admin/commissions${status === "ALL" ? "" : `?status=${status}`}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: COMMISSIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = useMutation({
    mutationFn: (vars: { id: string; action: "validate" | "cancel"; reason?: string }) => apiSend("/api/admin/commissions", "PATCH", vars),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "validate" ? "Commission validée — le démarcheur peut la retirer" : "Commission annulée");
      setCancelTarget(null);
      setValidateTarget(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  const items = commissionsQ.data?.items ?? [];
  const now = Date.now();

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Commissions démarcheurs"
        description="Commissions créées à la signature d'un bail via un lien d'affiliation. La validation n'est possible qu'après la fenêtre anti-fraude."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52" aria-label="Filtrer par statut">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING_VALIDATION">{label("PENDING_VALIDATION")}</SelectItem>
              <SelectItem value="VALIDATED">{label("VALIDATED")}</SelectItem>
              <SelectItem value="PAID">{label("PAID")}</SelectItem>
              <SelectItem value="CANCELLED">{label("CANCELLED")}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Anti-fraude : chaque commission reste gelée pendant la période de validation paramétrable (par défaut 7 jours). Validez uniquement après vérification de la location réelle ;
          le versement au démarcheur s&apos;effectue ensuite via la file des retraits.
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {commissionsQ.isError && <AdminError error={commissionsQ.error} onRetry={() => void commissionsQ.refetch()} />}
        {commissionsQ.isLoading && <div className="p-4"><RowsSkeleton rows={6} /></div>}
        {commissionsQ.data && items.length === 0 && (
          <EmptyState icon={Check} title="Aucune commission" description="Aucune commission pour ce filtre." className="border-0" />
        )}
        {commissionsQ.data && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Démarcheur</TableHead>
                  <TableHead>Offre</TableHead>
                  <TableHead className="text-right">Part locataire</TableHead>
                  <TableHead className="text-right">Part propriétaire</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Validable</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => {
                  const canValidate = c.status === "PENDING_VALIDATION" && new Date(c.validatableAt).getTime() <= now;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="text-sm font-semibold">{c.agent.fullName}</p>
                        <p className="text-xs text-muted-foreground">{c.agent.phone ?? "—"}</p>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <p className="truncate text-sm font-medium" title={c.listing.title}>{c.listing.title}</p>
                        <p className="text-xs text-muted-foreground">{c.listing.reference}{c.leaseRef ? ` · bail ${c.leaseRef}` : ""}</p>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatFcfa(c.tenantShare)}</TableCell>
                      <TableCell className="text-right text-sm">{formatFcfa(c.ownerShare)}</TableCell>
                      <TableCell className="text-right font-display text-sm font-bold">{formatFcfa(c.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                        {c.fraudFlag && <p className="mt-1 max-w-40 truncate text-[11px] text-red-600 dark:text-red-400" title={c.fraudFlag}>⚠ {c.fraudFlag}</p>}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          {formatDate(c.validatableAt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "PENDING_VALIDATION" && (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                              disabled={!canValidate || act.isPending} aria-label={`Valider la commission de ${c.agent.fullName}`}
                              title={canValidate ? "Valider la commission" : `Validable à partir du ${formatDate(c.validatableAt)}`}
                              onClick={() => setValidateTarget(c)}>
                              <Check className="size-4" aria-hidden /> Valider
                            </Button>
                            <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                              disabled={act.isPending} onClick={() => { setCancelTarget(c); setReason(""); }}>
                              <X className="size-4" aria-hidden /> Annuler
                            </Button>
                          </div>
                        )}
                        {c.status === "VALIDATED" && <span className="text-xs text-muted-foreground">Retirable par le démarcheur</span>}
                        {c.status === "PAID" && <span className="text-xs text-muted-foreground">Payée le {formatDate(c.paidAt!)}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Confirmation de validation */}
      <AlertDialog open={validateTarget !== null} onOpenChange={(open) => { if (!open) setValidateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider cette commission ?</AlertDialogTitle>
            <AlertDialogDescription>
              {validateTarget && `${formatFcfa(validateTarget.total)} pour ${validateTarget.agent.fullName} (offre « ${validateTarget.listing.title} »). Après validation, le démarcheur pourra demander le retrait.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={act.isPending}
              onClick={() => validateTarget && act.mutate({ id: validateTarget.id, action: "validate" })}>
              {act.isPending && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />} Valider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Annulation avec motif */}
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler la commission</DialogTitle>
            <DialogDescription>
              {cancelTarget && `${formatFcfa(cancelTarget.total)} — ${cancelTarget.agent.fullName} (offre « ${cancelTarget.listing.title} »). Le motif est enregistré comme indicateur anti-fraude.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Motif (ex. location fictive, auto-parrainage détecté…)" aria-label="Motif de l'annulation" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Annuler</Button>
            <Button variant="destructive" disabled={act.isPending || reason.trim().length < 3}
              onClick={() => cancelTarget && act.mutate({ id: cancelTarget.id, action: "cancel", reason: reason.trim() })}>
              {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer l&apos;annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
