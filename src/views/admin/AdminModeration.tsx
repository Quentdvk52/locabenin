"use client";

// ============================================================
// LocaBénin — AdminModeration : file de modération des offres
// Onglets : En attente (PENDING_REVIEW) / Toutes / Doublons.
// Actions : approuver, refuser (motif), suspendre, mettre à la une.
// ============================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, PauseCircle, Star, Copy, ImageIcon, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { KycBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminError, PageIntro } from "./components/bits";

export interface ModListing {
  id: string;
  reference: string;
  title: string;
  type: string;
  genre: string;
  status: string;
  price: number;
  pricePeriod: string;
  isFeatured: boolean;
  moderationNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  coverUrl: string | null;
  reportsCount: number;
  favoritesCount: number;
  owner: { id: string; fullName: string; kycStatus: string; phone: string | null };
}

interface DupGroup {
  key: string;
  ownerId: string;
  ownerName: string;
  sameOwner: boolean;
  items: ModListing[];
}

const LISTINGS_KEY = ["admin", "listings"] as const;

interface ActMutation {
  mutate: (v: { id: string; action: string; note?: string }, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

export default function AdminModeration() {
  const [tab, setTab] = useState("pending");
  const [rejectTarget, setRejectTarget] = useState<ModListing | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const queryClient = useQueryClient();

  const pendingQ = useQuery({
    queryKey: [...LISTINGS_KEY, "pending"],
    queryFn: () => apiGet<{ items: ModListing[] }>("/api/admin/listings?status=PENDING_REVIEW&take=100"),
  });
  const dupQ = useQuery({
    queryKey: [...LISTINGS_KEY, "dups"],
    queryFn: () => apiGet<{ groups: DupGroup[] }>("/api/admin/listings?duplicates=1"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: LISTINGS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = useMutation({
    mutationFn: (vars: { id: string; action: string; note?: string }) => apiSend("/api/admin/listings", "PATCH", vars),
    onSuccess: (_d, vars) => {
      const messages: Record<string, string> = {
        approve: "Offre approuvée et publiée",
        reject: "Offre refusée — retournée au propriétaire",
        suspend: "Offre suspendue",
        feature: "Offre mise à la une",
        unfeature: "Offre retirée de la une",
      };
      toast.success(messages[vars.action] ?? "Action effectuée");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  const onReject = (l: ModListing) => {
    setRejectTarget(l);
    setRejectNote("");
  };
  const confirmReject = () => {
    if (!rejectTarget) return;
    act.mutate(
      { id: rejectTarget.id, action: "reject", note: rejectNote.trim() || undefined },
      { onSuccess: () => setRejectTarget(null) },
    );
  };

  const totalPending = pendingQ.data?.items.length ?? 0;
  const dupCount = dupQ.data?.groups.reduce((a, g) => a + g.items.length, 0) ?? 0;

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Modération des offres"
        description="Validez, refusez ou suspendez les offres. La détection de doublons regroupe les titres identiques d'un même propriétaire."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="pending" className="gap-2">
            En attente
            {totalPending > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-amber-950">{totalPending}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="dups" className="gap-2">
            Doublons
            {dupCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{dupCount}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* --- File en attente --- */}
        <TabsContent value="pending" className="space-y-3">
          {pendingQ.isError && <AdminError error={pendingQ.error} onRetry={() => void pendingQ.refetch()} />}
          {pendingQ.isLoading && <RowsSkeleton rows={4} />}
          {pendingQ.data && pendingQ.data.items.length === 0 && (
            <EmptyState icon={Check} title="File vide" description="Aucune offre en attente de validation. Tout est traité !" />
          )}
          {pendingQ.data?.items.map((l) => (
            <ListingRow key={l.id} listing={l} act={act} onReject={onReject} />
          ))}
        </TabsContent>

        {/* --- Toutes --- */}
        <TabsContent value="all">
          <AllListings act={act} onReject={onReject} />
        </TabsContent>

        {/* --- Doublons --- */}
        <TabsContent value="dups" className="space-y-4">
          {dupQ.isError && <AdminError error={dupQ.error} onRetry={() => void dupQ.refetch()} />}
          {dupQ.isLoading && <RowsSkeleton rows={3} />}
          {dupQ.data && dupQ.data.groups.length === 0 && (
            <EmptyState icon={Copy} title="Aucun doublon détecté" description="Aucun titre identique rattaché au même propriétaire." />
          )}
          {dupQ.data?.groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-2xl border border-amber-300/70 bg-amber-50/40 shadow-soft dark:border-amber-500/25 dark:bg-amber-500/5">
              <header className="flex flex-wrap items-center gap-2 border-b border-amber-200/70 bg-card/60 px-4 py-3 dark:border-amber-500/20">
                <Badge className="bg-amber-500 text-amber-950">⚠ {g.items.length} offres similaires</Badge>
                <Badge variant="outline" className="bg-background">Même propriétaire : {g.ownerName}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">Titre normalisé identique</span>
              </header>
              <div className="space-y-3 p-4">
                {g.items.map((l) => (
                  <ListingRow key={l.id} listing={l} act={act} onReject={onReject} compact />
                ))}
              </div>
            </section>
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog de refus (motif) */}
      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser l&apos;offre</DialogTitle>
            <DialogDescription>
              L&apos;offre « {rejectTarget?.title} » sera retournée au propriétaire en brouillon avec votre motif.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Motif du refus (ex. photos non conformes, description incomplète…)"
            rows={3}
            aria-label="Motif du refus"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Annuler</Button>
            <Button variant="destructive" disabled={act.isPending} onClick={confirmReject}>
              {act.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Liste « Toutes » (chargée à l'ouverture de l'onglet). */
function AllListings({ act, onReject }: { act: ActMutation; onReject: (l: ModListing) => void }) {
  const allQ = useQuery({
    queryKey: [...LISTINGS_KEY, "all"],
    queryFn: () => apiGet<{ items: ModListing[] }>("/api/admin/listings?status=ALL&take=100"),
  });

  if (allQ.isError) return <AdminError error={allQ.error} onRetry={() => void allQ.refetch()} />;
  if (allQ.isLoading) return <RowsSkeleton rows={6} />;
  if (!allQ.data || allQ.data.items.length === 0) {
    return <EmptyState icon={Inbox} title="Aucune offre" description="Aucune offre active ou soumise pour le moment." />;
  }
  return (
    <div className="space-y-3">
      {allQ.data.items.map((l) => (
        <ListingRow key={l.id} listing={l} act={act} onReject={onReject} />
      ))}
    </div>
  );
}

function MiniCover({ url, title }: { url: string | null; title: string }) {
  if (url) {
    return <img src={url} alt={`Couverture — ${title}`} className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" />;
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
      <ImageIcon className="size-5" />
    </span>
  );
}

function ListingRow({
  listing: l, act, onReject, compact = false,
}: {
  listing: ModListing;
  act: ActMutation;
  onReject: (l: ModListing) => void;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center" : "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:flex-row sm:items-center"}>
      <MiniCover url={l.coverUrl} title={l.title} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-bold">{l.title}</h3>
          <StatusBadge status={l.status} />
          {l.isFeatured && <Badge className="bg-amber-500 text-amber-950">À la une</Badge>}
          {l.reportsCount > 0 && <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-400">{l.reportsCount} signalement(s)</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {l.reference} · {label(l.type)} · {label(l.genre)} · <span className="font-semibold text-foreground">{formatFcfa(l.price)} / {label(l.pricePeriod)}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Propriétaire : <span className="font-medium text-foreground">{l.owner.fullName}</span> · soumise le {formatDate(l.createdAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <KycBadge status={l.owner.kycStatus} />
          {l.moderationNote && (
            <span className="truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={l.moderationNote}>
              Note : {l.moderationNote}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {l.status !== "PUBLISHED" && (
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={act.isPending} aria-label={`Approuver ${l.title}`}
            onClick={() => act.mutate({ id: l.id, action: "approve" })}>
            <Check className="size-4" aria-hidden /> Approuver
          </Button>
        )}
        <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
          disabled={act.isPending} onClick={() => onReject(l)} aria-label={`Refuser ${l.title}`}>
          <X className="size-4" aria-hidden /> Refuser
        </Button>
        {l.status === "PUBLISHED" && (
          <Button size="sm" variant="outline" disabled={act.isPending} aria-label={`Suspendre ${l.title}`}
            onClick={() => act.mutate({ id: l.id, action: "suspend" })}>
            <PauseCircle className="size-4" aria-hidden /> Suspendre
          </Button>
        )}
        <Button size="sm" variant={l.isFeatured ? "secondary" : "ghost"} disabled={act.isPending}
          aria-label={l.isFeatured ? `Retirer ${l.title} de la une` : `Mettre ${l.title} à la une`}
          onClick={() => act.mutate({ id: l.id, action: l.isFeatured ? "unfeature" : "feature" })}>
          <Star className={l.isFeatured ? "size-4 fill-amber-500 text-amber-500" : "size-4"} aria-hidden />
          {l.isFeatured ? "Retirer de la une" : "À la une"}
        </Button>
      </div>
    </article>
  );
}
