"use client";

// ============================================================
// LocaBénin — Espace Locataire : tickets de réparation
// Création avec photos compressées, fil de discussion, statut.
// ============================================================

import { useRef, useState } from "react";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus, Loader2, Send, Paperclip, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { useSession } from "@/lib/client/session";
import { formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  guardedGet, guardedSend, mutationError, pickCurrentLease, uploadPhoto,
  type RawLease,
} from "./api";

interface TicketUpdate {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  photoUrl: string | null;
  statusAfter: string | null;
  createdAt: string;
}

interface RawTicket {
  id: string;
  title: string;
  description: string;
  photos: string[];
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  leaseId: string;
  listing: { title: string };
  updates: TicketUpdate[];
}

const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;

export function TenantTickets() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const tickets = useQuery({
    queryKey: ["tickets"],
    queryFn: () => guardedGet<RawTicket[]>("/api/tickets"),
  });

  const leases = useQuery({
    queryKey: ["leases"],
    queryFn: () => guardedGet<RawLease[]>("/api/leases"),
  });

  const activeLease = pickCurrentLease(leases.data ?? []);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriority("NORMAL");
    setPhotos([]);
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (photos.length >= 4) {
      toast.error("Maximum 4 photos par ticket.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhotos((p) => [...p, url]);
      toast.success("Photo ajoutée.");
    } catch (e) {
      toast.error(mutationError(e, "Upload impossible."));
    } finally {
      setUploading(false);
    }
  }

  async function createTicket() {
    if (!activeLease) return;
    if (title.trim().length < 3 || description.trim().length < 5) {
      toast.error("Renseignez un titre (3+ caractères) et une description (5+ caractères).");
      return;
    }
    setCreating(true);
    try {
      await guardedSend("/api/tickets", "POST", {
        leaseId: activeLease.id,
        title: title.trim(),
        description: description.trim(),
        priority,
        photos,
      });
      toast.success("Ticket envoyé — le propriétaire a été notifié.");
      setCreateOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (e) {
      toast.error(mutationError(e, "Création impossible."));
    } finally {
      setCreating(false);
    }
  }

  async function sendReply(ticketId: string) {
    const body = (replyDraft[ticketId] ?? "").trim();
    if (!body) return;
    setReplying(ticketId);
    try {
      await guardedSend("/api/tickets", "PATCH", { id: ticketId, body });
      setReplyDraft((d) => ({ ...d, [ticketId]: "" }));
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (e) {
      toast.error(mutationError(e, "Envoi impossible."));
    } finally {
      setReplying(null);
    }
  }

  const items = tickets.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Mes tickets de réparation</h2>
          <p className="text-sm text-muted-foreground">Signalez un souci dans votre logement et suivez sa résolution.</p>
        </div>
        <Button
          size="lg"
          className="min-h-[48px]"
          disabled={!activeLease}
          onClick={() => {
            if (!activeLease) {
              toast.error("Vous devez avoir un bail actif pour créer un ticket.");
              return;
            }
            setCreateOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden /> Nouveau ticket
        </Button>
      </div>

      {!activeLease && !leases.isLoading && (
        <p className="rounded-xl border border-dashed bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          Les tickets sont rattachés à votre bail. Vous n&apos;avez pas de bail actif pour le moment.
        </p>
      )}

      {tickets.isLoading && <RowsSkeleton rows={3} />}
      {tickets.isError && <ErrorState message="Impossible de charger vos tickets." onRetry={() => void tickets.refetch()} />}

      {!tickets.isLoading && !tickets.isError && items.length === 0 && (
        <EmptyState
          icon={Wrench}
          title="Aucun ticket ouvert"
          description="Fuite, panne, serrure bloquée ? Créez un ticket : le propriétaire est notifié immédiatement et la discussion est archivée."
          actionLabel="Créer mon premier ticket"
          onAction={() => setCreateOpen(true)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((t) => {
          const mine = user?.id;
          return (
            <article key={t.id} className="flex flex-col rounded-2xl border bg-card shadow-soft" aria-label={`Ticket ${t.title}`}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold">{t.title}</h3>
                  <div className="flex shrink-0 gap-1.5">
                    <StatusBadge status={t.status} />
                    {t.priority !== "NORMAL" && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", t.priority === "HIGH" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
                        {t.priority === "HIGH" ? "Urgent" : "Priorité basse"}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t.listing.title} · ouvert le {formatDate(t.createdAt)}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>

                {t.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="relative size-20 overflow-hidden rounded-lg border">
                        <Image src={url} alt="Photo du ticket" fill sizes="80px" className="object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Fil de discussion */}
              <div className="styled-scroll max-h-64 flex-1 space-y-2 overflow-y-auto border-t bg-secondary/30 p-4">
                {t.updates.length === 0 && <p className="text-xs text-muted-foreground">Aucun message pour l&apos;instant.</p>}
                {t.updates.map((u) => {
                  const isTenant = u.authorId === mine;
                  return (
                    <div key={u.id} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", isTenant ? "ml-auto bg-primary text-primary-foreground" : "bg-card border")}>
                      <p className="whitespace-pre-wrap">{u.body}</p>
                      <p className={cn("mt-1 text-[10px]", isTenant ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {isTenant ? "Vous" : "Propriétaire"} · {formatDate(u.createdAt, true)}
                        {u.statusAfter ? ` · statut → ${label(u.statusAfter)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>

              {t.status !== "CLOSED" && (
                <div className="flex items-center gap-2 border-t p-3">
                  <Input
                    value={replyDraft[t.id] ?? ""}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void sendReply(t.id); }}
                    placeholder="Ajouter un message…"
                    aria-label={`Répondre au ticket ${t.title}`}
                    className="h-11"
                  />
                  <Button size="icon" className="size-11 shrink-0" disabled={replying === t.id || !(replyDraft[t.id] ?? "").trim()} onClick={() => void sendReply(t.id)} aria-label="Envoyer le message">
                    {replying === t.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Dialogue de création */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v && !creating) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg" aria-describedby="ticket-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare className="size-5 text-primary" aria-hidden /> Nouveau ticket de réparation</DialogTitle>
            <DialogDescription id="ticket-desc">
              Décrivez précisément le problème — joignez des photos si possible (jusqu&apos;à 4).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-title">Titre</Label>
              <Input id="ticket-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Fuite d'eau sous l'évier" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-desc">Description</Label>
              <Textarea id="ticket-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Depuis quand ? Où exactement ? Qu'avez-vous déjà essayé ?" rows={4} maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-11 w-full" aria-label="Priorité du ticket"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p === "LOW" ? "Basse" : p === "NORMAL" ? "Normale" : "Haute (urgence)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Photos (max 4)</Label>
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((url, i) => (
                  <span key={url} className="relative size-16 overflow-hidden rounded-lg border">
                    <Image src={url} alt={`Photo ${i + 1}`} fill sizes="64px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                      className="absolute right-0 top-0 grid size-5 place-items-center rounded-bl-lg bg-black/70 text-white"
                      aria-label={`Retirer la photo ${i + 1}`}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
                {photos.length < 4 && (
                  <button
                    type="button"
                    onClick={() => photoInput.current?.click()}
                    className="grid size-16 place-items-center rounded-lg border border-dashed text-muted-foreground hover:bg-secondary/60"
                    aria-label="Ajouter une photo"
                  >
                    {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Paperclip className="size-5" aria-hidden />}
                  </button>
                )}
                <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <p className="text-xs text-muted-foreground">Photos compressées automatiquement pour économiser votre data.</p>
            </div>
            <Button className="h-11 w-full" disabled={creating || uploading} onClick={() => void createTicket()}>
              {creating ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Envoi…</> : "Envoyer le ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

