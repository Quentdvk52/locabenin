"use client";

// ============================================================
// LocaBénin — AdminKyc : file de vérification d'identité
// Onglet File : documents PENDING groupés par utilisateur avec
// vignettes cliquables (Dialog plein écran) + Approuver / Refuser.
// Onglet Historique : tous les documents traités.
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileImage, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { KycBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogTitle as ZoomTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminError, PageIntro, initials } from "./components/bits";

interface KycDoc {
  id: string;
  kind: string;
  fileUrl: string;
  status: string;
  createdAt: string;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
}

interface KycGroup {
  user: { id: string; fullName: string; phone: string | null; avatarUrl: string | null; kycStatus: string; createdAt: string };
  docs: KycDoc[];
}

interface KycHistoryDoc extends KycDoc {
  user: { id: string; fullName: string; phone: string | null };
}

const KYC_KEY = ["admin", "kyc"] as const;

export default function AdminKyc() {
  const [rejectTarget, setRejectTarget] = useState<KycGroup | null>(null);
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState<{ url: string; kind: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const pendingQ = useQuery({
    queryKey: [...KYC_KEY, "pending"],
    queryFn: () => apiGet<{ mode: string; groups: KycGroup[] }>("/api/admin/kyc?status=PENDING"),
  });
  const historyQ = useQuery({
    queryKey: [...KYC_KEY, "history"],
    queryFn: () => apiGet<{ mode: string; docs: KycHistoryDoc[] }>("/api/admin/kyc?status=ALL"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: KYC_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  const decide = useMutation({
    mutationFn: (vars: { userId: string; decision: "APPROVED" | "REJECTED"; reason?: string }) =>
      apiSend("/api/admin/kyc", "PATCH", vars),
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === "APPROVED" ? "Identité vérifiée : documents approuvés" : "Documents refusés — notification envoyée");
      setRejectTarget(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Vérification d'identité (KYC)"
        description="Examinez les documents soumis par les utilisateurs. L'approbation débloque les retraits, contrats et l'option démarcheur."
      />

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            File de validation
            {(pendingQ.data?.groups.length ?? 0) > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-amber-950">{pendingQ.data!.groups.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* --- File --- */}
        <TabsContent value="pending" className="space-y-4">
          {pendingQ.isError && <AdminError error={pendingQ.error} onRetry={() => void pendingQ.refetch()} />}
          {pendingQ.isLoading && <RowsSkeleton rows={3} />}
          {pendingQ.data && pendingQ.data.groups.length === 0 && (
            <EmptyState icon={BadgeCheck} title="Aucun document en attente" description="Toutes les vérifications d'identité sont traitées." />
          )}
          {pendingQ.data?.groups.map((g) => (
            <article key={g.user.id} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
              <header className="flex flex-wrap items-center gap-3">
                <Avatar className="size-10">
                  {g.user.avatarUrl && <AvatarImage src={g.user.avatarUrl} alt={g.user.fullName} />}
                  <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">{initials(g.user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{g.user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{g.user.phone ?? "—"} · inscrit le {formatDate(g.user.createdAt)}</p>
                </div>
                <KycBadge status={g.user.kycStatus} />
              </header>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {g.docs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setZoom({ url: d.fileUrl, kind: d.kind, name: g.user.fullName })}
                    className="group overflow-hidden rounded-xl border text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Agrandir le document ${label(d.kind)} de ${g.user.fullName}`}
                  >
                    <img src={d.fileUrl} alt={`${label(d.kind)} — ${g.user.fullName}`} className="aspect-[4/3] w-full bg-muted object-cover" loading="lazy" />
                    <span className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold">
                      <FileImage className="size-3.5 text-muted-foreground" aria-hidden />
                      {label(d.kind)}
                    </span>
                  </button>
                ))}
              </div>

              <footer className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={decide.isPending}
                  onClick={() => decide.mutate({ userId: g.user.id, decision: "APPROVED" })}>
                  {decide.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  <BadgeCheck className="size-4" aria-hidden /> Approuver l&apos;identité
                </Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                  onClick={() => { setRejectTarget(g); setReason(""); }}>
                  <X className="size-4" aria-hidden /> Refuser
                </Button>
                <span className="text-xs text-muted-foreground">{g.docs.length} document(s) soumis</span>
              </footer>
            </article>
          ))}
        </TabsContent>

        {/* --- Historique --- */}
        <TabsContent value="history">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            {historyQ.isError && <AdminError error={historyQ.error} onRetry={() => void historyQ.refetch()} />}
            {historyQ.isLoading && <div className="p-4"><RowsSkeleton rows={6} /></div>}
            {historyQ.data && historyQ.data.docs.length === 0 && (
              <EmptyState icon={FileImage} title="Aucun document" description="Aucun document KYC soumis à ce jour." className="border-0" />
            )}
            {historyQ.data && historyQ.data.docs.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Soumis le</TableHead>
                      <TableHead>Décision</TableHead>
                      <TableHead>Motif / revu le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQ.data.docs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <p className="text-sm font-semibold">{d.user.fullName}</p>
                          <p className="text-xs text-muted-foreground">{d.user.phone ?? "—"}</p>
                        </TableCell>
                        <TableCell>
                          <button type="button" className="text-sm font-medium text-primary hover:underline"
                            onClick={() => setZoom({ url: d.fileUrl, kind: d.kind, name: d.user.fullName })}>
                            {label(d.kind)}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          {d.rejectionReason ? <span className="text-red-600 dark:text-red-400">{d.rejectionReason}</span> : d.reviewedAt ? formatDate(d.reviewedAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de refus */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser les documents</DialogTitle>
            <DialogDescription>
              Tous les documents en attente de {rejectTarget?.user.fullName} seront marqués refusés. Le motif est obligatoire et communiqué à l&apos;utilisateur.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="Ex. photo illisible, nom ne correspondant pas au compte…" aria-label="Motif du refus" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button>
            <Button variant="destructive" disabled={decide.isPending || reason.trim().length < 3}
              onClick={() => rejectTarget && decide.mutate({ userId: rejectTarget.user.id, decision: "REJECTED", reason: reason.trim() })}>
              {decide.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zoom plein écran du document */}
      <Dialog open={zoom !== null} onOpenChange={(open) => { if (!open) setZoom(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-2 sm:p-3">
          <ZoomTitle className="sr-only">{zoom ? `${label(zoom.kind)} — ${zoom.name}` : "Document"}</ZoomTitle>
          {zoom && (
            <>
              <img src={zoom.url} alt={`${label(zoom.kind)} — ${zoom.name}`} className="max-h-[75vh] w-full rounded-lg bg-muted object-contain" />
              <p className="pt-2 text-center text-xs text-muted-foreground">{label(zoom.kind)} — {zoom.name}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
