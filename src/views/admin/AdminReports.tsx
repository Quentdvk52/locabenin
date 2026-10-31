"use client";

// ============================================================
// LocaBénin — AdminReports : signalements utilisateurs
// Cards : motif, détails, offre liée, reporter, statut.
// Actions : Traiter (résoudre + note + option « suspendre l'offre »)
// ou Rejeter (non fondé).
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Check, X, Loader2, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AdminError, PageIntro } from "./components/bits";

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  reporter: { id: string; fullName: string; phone: string | null };
  listing: { id: string; title: string; reference: string; status: string; ownerName: string | null } | null;
}

const REPORTS_KEY = ["admin", "reports"] as const;

const REASON_TONE: Record<string, string> = {
  SCAM: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  FAKE: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  INAPPROPRIATE: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
  DUPLICATE: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
  OTHER: "bg-muted text-muted-foreground",
};

export default function AdminReports() {
  const [status, setStatus] = useState("OPEN");
  const [resolveTarget, setResolveTarget] = useState<AdminReport | null>(null);
  const [resolution, setResolution] = useState("");
  const [suspendListing, setSuspendListing] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<AdminReport | null>(null);
  const queryClient = useQueryClient();

  const reportsQ = useQuery({
    queryKey: [...REPORTS_KEY, status],
    queryFn: () => apiGet<{ items: AdminReport[]; total: number }>(`/api/admin/reports${status === "ALL" ? "" : `?status=${status}`}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "listings"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = useMutation({
    mutationFn: (vars: { id: string; action: "resolve" | "dismiss"; resolution?: string; suspendListing?: boolean }) =>
      apiSend("/api/admin/reports", "PATCH", vars),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "resolve" ? "Signalement traité" : "Signalement rejeté (non fondé)");
      setResolveTarget(null);
      setDismissTarget(null);
      setResolution("");
      setSuspendListing(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  const items = reportsQ.data?.items ?? [];

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Signalements"
        description="Contenus signalés par les utilisateurs : arnaques, fausses annonces, doublons. Traitez chaque signalement avec une note de résolution."
        actions={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44" aria-label="Filtrer par statut">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">{label("OPEN")}</SelectItem>
              <SelectItem value="REVIEWING">{label("IN_PROGRESS")}</SelectItem>
              <SelectItem value="RESOLVED">{label("RESOLVED")}</SelectItem>
              <SelectItem value="DISMISSED">Non fondé</SelectItem>
              <SelectItem value="ALL">Tous</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {reportsQ.isError && <AdminError error={reportsQ.error} onRetry={() => void reportsQ.refetch()} />}
      {reportsQ.isLoading && <RowsSkeleton rows={4} />}
      {reportsQ.data && items.length === 0 && (
        <EmptyState icon={ShieldAlert} title="Aucun signalement" description="Aucun signalement pour ce filtre. La communauté est tranquille !" />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((r) => (
          <article key={r.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <header className="flex flex-wrap items-center gap-2">
              <Badge className={`border-0 font-semibold ${REASON_TONE[r.reason] ?? "bg-muted"}`}>
                <ShieldAlert className="mr-1 size-3" aria-hidden /> {label(r.reason)}
              </Badge>
              <StatusBadge status={r.status} />
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.createdAt, true)}</span>
            </header>

            {r.details && <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm">{r.details}</p>}

            <div className="mt-3 space-y-1.5 text-sm">
              {r.listing ? (
                <p className="flex items-start gap-1.5">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    Offre signalée : <span className="font-semibold">{r.listing.title}</span>{" "}
                    <span className="text-xs text-muted-foreground">({r.listing.reference} · {label(r.listing.status)}{r.listing.ownerName ? ` · ${r.listing.ownerName}` : ""})</span>
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="size-4" aria-hidden /> Aucune offre liée</p>
              )}
              <p className="flex items-center gap-1.5">
                <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                Signalé par <span className="font-semibold">{r.reporter.fullName}</span>
                <span className="text-xs text-muted-foreground">({r.reporter.phone ?? "—"})</span>
              </p>
            </div>

            {r.resolution && (
              <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                Résolution : {r.resolution}
              </p>
            )}

            {(r.status === "OPEN" || r.status === "REVIEWING") && (
              <footer className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => { setResolveTarget(r); setResolution(""); setSuspendListing(false); }}>
                  <Check className="size-4" aria-hidden /> Traiter
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDismissTarget(r)}>
                  <X className="size-4" aria-hidden /> Rejeter
                </Button>
              </footer>
            )}
          </article>
        ))}
      </div>

      {/* Dialog de résolution */}
      <Dialog open={resolveTarget !== null} onOpenChange={(open) => { if (!open) setResolveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Traiter le signalement</DialogTitle>
            <DialogDescription>
              {resolveTarget && `Signalement « ${label(resolveTarget.reason)} »${resolveTarget.listing ? ` — offre « ${resolveTarget.listing.title} »` : ""}.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            placeholder="Note de résolution (ex. contact établi, annonce corrigée, fraude confirmée…)"
            aria-label="Note de résolution"
          />
          {resolveTarget?.listing && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5 dark:border-red-500/25 dark:bg-red-500/10">
              <Checkbox
                id="suspend-listing"
                checked={suspendListing}
                onCheckedChange={(v) => setSuspendListing(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="suspend-listing" className="cursor-pointer text-sm leading-snug">
                Suspendre également l&apos;offre signalée
                <span className="block text-xs font-normal text-muted-foreground">
                  L&apos;offre sera passée en « Suspendu » et le propriétaire notifié.
                </span>
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Annuler</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={act.isPending || resolution.trim().length < 3}
              onClick={() => resolveTarget && act.mutate({ id: resolveTarget.id, action: "resolve", resolution: resolution.trim(), suspendListing })}>
              {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer le traitement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation de rejet */}
      <Dialog open={dismissTarget !== null} onOpenChange={(open) => { if (!open) setDismissTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeter le signalement</DialogTitle>
            <DialogDescription>Le signalement sera marqué « non fondé » et archivé. Aucune sanction ne sera appliquée.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissTarget(null)}>Annuler</Button>
            <Button variant="destructive" disabled={act.isPending}
              onClick={() => dismissTarget && act.mutate({ id: dismissTarget.id, action: "dismiss" })}>
              {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
