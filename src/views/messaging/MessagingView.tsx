"use client";

// ============================================================
// LocaBénin — Messagerie temps réel (propriétaire ↔ locataire)
// Liste des conversations + fil de discussion. Temps réel via le
// mini-service socket.io (fallback : rafraîchissement 15 s).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, MessagesSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PublicHeader, PublicTabBar } from "@/components/layout/chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession, apiGet, apiSend } from "@/lib/client/session";
import { navigate, useRoute } from "@/lib/client/router";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `il y a ${Math.floor(diff / 3600_000)} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);
}

interface ConversationItem {
  id: string;
  listing: { id: string; title: string } | null;
  other: { id: string; fullName: string; avatarUrl: string | null } | null;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
}

interface MessageItem {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarUrl: string | null };
}

export default function MessagingView() {
  const route = useRoute();
  const { user, loading } = useSession();
  const activeConvId = route.query.c ?? null;
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<ConversationItem[]>("/api/conversations"),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  const messages = useQuery({
    queryKey: ["messages", activeConvId],
    queryFn: () => apiGet<MessageItem[]>(`/api/conversations/${activeConvId}/messages`),
    enabled: Boolean(activeConvId && user),
    refetchInterval: 15_000,
  });

  // Temps réel (socket.io via la passerelle) — bonne surprise si le service tourne
  useEffect(() => {
    if (!user || !activeConvId) return;
    let socket: import("socket.io-client").Socket | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const s = io("/?XTransformPort=3003", { transports: ["websocket", "polling"], reconnectionAttempts: 3, timeout: 5000 });
        if (cancelled) { s.disconnect(); return; }
        socket = s;
        s.on("connect", () => {
          s.emit("join-room", { room: `conv:${activeConvId}` });
          s.emit("join-room", { room: `user:${user.id}` });
        });
        s.on("bridge-event", (payload: { room: string; event: string; data: unknown }) => {
          if (payload.event === "message" && typeof payload.data === "object" && payload.data && "conversationId" in payload.data) {
            if ((payload.data as { conversationId: string }).conversationId === activeConvId) {
              qc.invalidateQueries({ queryKey: ["messages", activeConvId] });
              qc.invalidateQueries({ queryKey: ["conversations"] });
            }
          }
        });
      } catch {
        /* fallback polling déjà actif */
      }
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [user, activeConvId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  async function sendMessage() {
    if (!draft.trim() || !activeConvId) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    try {
      await apiSend(`/api/conversations/${activeConvId}/messages`, "POST", { body });
      qc.invalidateQueries({ queryKey: ["messages", activeConvId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <MessagesSquare className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-bold">Connectez-vous pour voir vos messages</h1>
        <Button className="mt-6" onClick={() => navigate("/connexion")}>Se connecter</Button>
      </div>
    );
  }

  return (
    <>
      <PublicHeader />
      {activeConvId ? (
        <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 md:h-[calc(100vh-4rem)]">
          <div className="flex items-center gap-3 border-b py-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/messagerie")} aria-label="Retour aux conversations">
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{conversations.data?.find((c) => c.id === activeConvId)?.other?.fullName ?? "Conversation"}</p>
              {conversations.data?.find((c) => c.id === activeConvId)?.listing && (
                <p className="truncate text-xs text-muted-foreground">À propos de : {conversations.data.find((c) => c.id === activeConvId)!.listing!.title}</p>
              )}
            </div>
          </div>
          <div className="styled-scroll flex-1 space-y-3 overflow-y-auto py-4">
            {messages.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
            {messages.data?.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-soft", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card border")}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <form
            className="flex gap-2 border-t py-3 pb-24 md:pb-3"
            onSubmit={(e) => { e.preventDefault(); void sendMessage(); }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écrivez votre message…" aria-label="Message" />
            <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Envoyer">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-6 pb-28">
          <h1 className="font-display text-xl font-bold">Messagerie</h1>
          <div className="mt-4 space-y-2">
            {conversations.data?.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
                <MessagesSquare className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Aucune conversation. Contactez un propriétaire depuis une fiche d&apos;offre.
                </p>
              </div>
            )}
            {conversations.data?.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/messagerie?c=${c.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-lift"
              >
                <Avatar className="size-11">
                  <AvatarImage src={c.other?.avatarUrl ?? undefined} alt={c.other?.fullName ?? ""} />
                  <AvatarFallback className="bg-primary/15 font-semibold text-primary">{(c.other?.fullName ?? "?").slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{c.other?.fullName ?? "Utilisateur"}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  {c.listing && <p className="truncate text-xs text-primary">{c.listing.title}</p>}
                  <p className={cn("truncate text-sm", c.unread ? "font-semibold" : "text-muted-foreground")}>
                    {c.lastMessage?.body ?? "—"}
                  </p>
                </div>
                {c.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-amber-950">{c.unread}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <PublicTabBar />
    </>
  );
}
