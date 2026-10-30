"use client";

// ============================================================
// LocaBénin — Réparations (tickets de maintenance, côté propriétaire)
// Cards avec photos, fil de suivi (Timeline), changement de statut
// (prendre en charge / résolu / clôturé) + réponse.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Wrench, Send, Loader2, ImageOff, Phone } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, CardsSkeleton } from "@/components/shared/states";
import { Timeline } from "@/components/shared/form-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { handleApiError, initials, formatDateFr } from "./components/helpers";
import { cn } from "@/lib/utils";

interface TicketRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  listingTitle: string;
  tenant: { fullName: string; phone: string | null };
  photos: string[];
  updates: Array<{ id: string; authorId: string; body: string; statusAfter: string | null; createdAt: string }>;
}

const NEXT_ACTION: Record<string, { label: string; status: string } | null> = {
  OPEN: { label: "Prendre en charge", status: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Marquer comme résolu", status: "RESOLVED" },
  RESOLVED: { label: "Clôturer", status: "CLOSED" },
  CLOSED: null,
};

export default function OwnerTickets() {
  const qc = useQueryClient();
  const [reply, setReply] = useState<Record<string, string>>({});

  const tickets = useQuery<TicketRow[]>({
    queryKey: ["tickets", "owner"],
    queryFn: () => apiGet<TicketRow[]>("/api/owner/tickets"),
  });

  const update = useMutation({
    mutationFn: ({ id, status, body }: { id: string; status?: string; body?: string }) =>
      apiSend("/api/tickets", "PATCH", { id, ...(status ? { status } : {}), ...(body ? { body } : {}) }),
    onSuccess: () => {
      toast.success("Ticket mis à jour — le locataire est notifié.");
      void qc.invalidateQueries({ queryKey: ["tickets"] });
      void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
    },
    onError: (e) => handleApiError(e, "Mise à jour impossible."),
  });

  function sendUpdate(t: TicketRow, status?: string) {
    const body = reply[t.id]?.trim();
    if (!status && !body) {
      toast.error("Écrivez une réponse ou changez le statut.");
      return;
    }
    update.mutate({ id: t.id, status, ...(body ? { body } : {}) });
    setReply((r) => ({ ...r, [t.id]: "" }));
  }

  const openCount = (tickets.data ?? []).filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Réparations"
        subtitle={openCount > 0 ? `${openCount} ticket(s) à traiter` : "Tous les tickets sont traités"}
        icon={Wrench}
      />

      {tickets.isLoading ? (
        <CardsSkeleton count={4} />
      ) : tickets.isError ? (
        <ErrorState message="Impossible de charger les tickets." onRetry={() => void tickets.refetch()} />
      ) : (tickets.data ?? []).length === 0 ? (
        <EmptyState
          title="Aucun ticket de réparation"
          description="Les demandes de réparation envoyées par vos locataires apparaîtront ici, avec photos et suivi."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(tickets.data ?? []).map((t) => {
            const action = NEXT_ACTION[t.status] ?? null;
            return (
              <article key={t.id} className={cn("rounded-2xl border bg-card p-5 shadow-soft", t.status === "OPEN" && "border-amber-300/60 dark:border-amber-900/60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary" aria-hidden>
                      {initials(t.tenant.fullName)}
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-bold">{t.title}</h3>
                      <p className="text-xs text-muted-foreground">{t.listingTitle} · {t.tenant.fullName}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={t.status} />
                    {t.priority === "HIGH" && <span className="text-[11px] font-bold text-red-600">Priorité haute</span>}
                  </div>
                </div>

                <p className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">{t.description}</p>

                {t.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Photos du ticket">
                    {t.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border bg-secondary/40" aria-label={`Agrandir la photo ${i + 1}`}>
                        <img src={url} alt={`Photo du problème ${i + 1}`} className="h-full w-full object-cover transition-transform hover:scale-105" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}

                {t.updates.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Suivi ({t.updates.length} échange(s)) — créé le {formatDateFr(t.createdAt)}
                    </summary>
                    <div className="mt-3 max-h-60 overflow-y-auto pr-1">
                      <Timeline
                        items={t.updates.map((u) => ({
                          title: u.statusAfter ? `Statut : ${u.statusAfter === "RESOLVED" ? "résolu" : u.statusAfter === "IN_PROGRESS" ? "en cours" : u.statusAfter === "CLOSED" ? "clôturé" : "réouvert"}` : "Message",
                          description: u.body || undefined,
                          time: formatDateFr(u.createdAt, true),
                          state: "done" as const,
                        }))}
                      />
                    </div>
                  </details>
                )}

                {t.status !== "CLOSED" && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={reply[t.id] ?? ""}
                      onChange={(e) => setReply((r) => ({ ...r, [t.id]: e.target.value }))}
                      rows={2}
                      placeholder="Répondre au locataire (ex. le plombier passe jeudi matin)…"
                      aria-label={`Réponse au ticket ${t.title}`}
                    />
                    <div className="flex flex-wrap gap-2">
                      {action && (
                        <Button size="sm" className="h-9" disabled={update.isPending} onClick={() => sendUpdate(t, action.status)}>
                          {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wrench className="size-4" aria-hidden />}
                          {action.label}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-9" disabled={update.isPending || !(reply[t.id] ?? "").trim()} onClick={() => sendUpdate(t)}>
                        <Send className="size-4" aria-hidden /> Envoyer la réponse
                      </Button>
                      {t.tenant.phone && (
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => navigate("/messagerie")}>
                          <Phone className="size-4" aria-hidden /> Contacter
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {t.status === "CLOSED" && t.resolvedAt && (
                  <p className="mt-3 text-xs text-muted-foreground">Clôturé le {formatDateFr(t.resolvedAt)}.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {tickets.data?.length === 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" aria-hidden /> Astuce : demandez des photos au locataire pour un diagnostic rapide.
        </p>
      )}
    </div>
  );
}
