"use client";

// ============================================================
// LocaBénin — Annonces groupées (propriétaire)
// Envoi à tous ses locataires actifs ou par bien ; canaux in-app
// (toujours), SMS et WhatsApp (simulés en démo). Historique dessous.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Megaphone, Send, Loader2, Building2, Users, MessageSquare } from "lucide-react";
import { apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { handleApiError, formatDateFr } from "./components/helpers";
import { cn } from "@/lib/utils";

interface ListingOption { id: string; title: string; status: string }
interface AnnouncementRow {
  id: string;
  scope: string;
  scopeId: string | null;
  title: string;
  body: string;
  channels: string[];
  recipientCount: number;
  createdAt: string;
}

export default function OwnerAnnouncements() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"ALL" | "LISTING">("ALL");
  const [scopeId, setScopeId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);

  const listings = useQuery<ListingOption[]>({
    queryKey: ["owner", "listings"],
    queryFn: () => apiGet<ListingOption[]>("/api/owner/listings"),
    staleTime: 30_000,
  });

  const history = useQuery<AnnouncementRow[]>({
    queryKey: ["announcements", "owner"],
    queryFn: () => apiGet<AnnouncementRow[]>("/api/announcements"),
  });

  const send = useMutation({
    mutationFn: () =>
      apiSend<{ announcement: AnnouncementRow; recipientCount: number }>("/api/announcements", "POST", {
        scope,
        ...(scope === "LISTING" && scopeId ? { scopeId } : {}),
        title: title.trim(),
        body: body.trim(),
        channels: [...(sms ? ["SMS"] : []), ...(whatsapp ? ["WHATSAPP"] : []), "IN_APP"],
      }),
    onSuccess: (res) => {
      toast.success(`Annonce envoyée à ${res.recipientCount} locataire(s).`, {
        description: (sms || whatsapp) ? "SMS / WhatsApp simulés en démo." : "Notification in-app livrée.",
      });
      setTitle("");
      setBody("");
      setSms(false);
      setWhatsapp(false);
      setScopeId("");
      setScope("ALL");
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e) => handleApiError(e, "Envoi impossible."),
  });

  function submit() {
    if (title.trim().length < 3) { toast.error("Saisissez un titre (3 caractères minimum)."); return; }
    if (body.trim().length < 3) { toast.error("Saisissez le message de l'annonce."); return; }
    if (scope === "LISTING" && !scopeId) { toast.error("Choisissez le bien concerné."); return; }
    send.mutate();
  }

  const scopeLabel = (a: AnnouncementRow): string => {
    if (a.scope === "ALL") return "Tous mes locataires";
    const l = listings.data?.find((x) => x.id === a.scopeId);
    return l ? `Bien : ${l.title}` : "Bien précis";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Annonces groupées"
        subtitle="Informez tous vos locataires en une fois"
        icon={Megaphone}
      />

      <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Nouvelle annonce">
        <div className="space-y-2">
          <Label>Portée</Label>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as "ALL" | "LISTING")} className="flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="scope-all" className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border p-3.5 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
              <RadioGroupItem id="scope-all" value="ALL" />
              <Users className="size-4 text-primary" aria-hidden />
              <span className="text-sm font-medium">Tous mes locataires</span>
            </Label>
            <Label htmlFor="scope-listing" className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border p-3.5 font-normal has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
              <RadioGroupItem id="scope-listing" value="LISTING" />
              <Building2 className="size-4 text-primary" aria-hidden />
              <span className="text-sm font-medium">Par bien</span>
            </Label>
          </RadioGroup>
          {scope === "LISTING" && (
            <Select value={scopeId} onValueChange={setScopeId}>
              <SelectTrigger className="mt-2 h-11 w-full sm:w-96" aria-label="Choisir le bien concerné"><SelectValue placeholder="Choisir le bien concerné" /></SelectTrigger>
              <SelectContent>
                {(listings.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-title">Titre</Label>
          <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex. Coupure d'eau jeudi matin dans la copropriété" className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ann-body">Message</Label>
          <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} placeholder="Détaillez l'information pour vos locataires…" />
        </div>

        <div className="space-y-2">
          <Label>Canaux d&apos;envoi</Label>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-2.5 rounded-xl border bg-secondary/40 p-3 font-normal opacity-80">
              <Checkbox checked disabled aria-label="Notification in-app (toujours active)" />
              <MessageSquare className="size-4" aria-hidden />
              <span className="text-sm">Notification in-app (toujours active)</span>
            </Label>
            <Label htmlFor="ch-sms" className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 font-normal">
              <Checkbox id="ch-sms" checked={sms} onCheckedChange={(v) => setSms(v === true)} aria-label="Envoyer aussi par SMS" />
              <span className="text-sm">SMS</span>
              <Badge variant="outline" className="text-[10px]">Simulé en démo</Badge>
            </Label>
            <Label htmlFor="ch-wa" className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 font-normal">
              <Checkbox id="ch-wa" checked={whatsapp} onCheckedChange={(v) => setWhatsapp(v === true)} aria-label="Envoyer aussi par WhatsApp" />
              <span className="text-sm">WhatsApp</span>
              <Badge variant="outline" className="text-[10px]">Simulé en démo</Badge>
            </Label>
          </div>
        </div>

        <Button className="h-11 w-full sm:w-auto" onClick={submit} disabled={send.isPending}>
          {send.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Envoyer l&apos;annonce
        </Button>
      </section>

      {/* ---- Historique ---- */}
      <section className="space-y-3" aria-label="Historique des annonces">
        <h2 className="font-display text-base font-semibold">Historique des annonces</h2>
        {history.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : history.isError ? (
          <ErrorState
            message={history.error instanceof ApiClientError ? history.error.message : "Impossible de charger l'historique."}
            onRetry={() => void history.refetch()}
          />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState title="Aucune annonce envoyée" description="Vos annonces groupées apparaîtront ici." icon={Megaphone} />
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {(history.data ?? []).map((a) => (
              <li key={a.id} className={cn("rounded-2xl border bg-card p-4 shadow-soft")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold">{a.title}</h3>
                  <span className="text-xs text-muted-foreground">{formatDateFr(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{scopeLabel(a)}</Badge>
                  <Badge variant="outline">{a.recipientCount} destinataire(s)</Badge>
                  {a.channels.map((c) => (
                    <Badge key={c} variant="secondary" className="font-semibold">{c === "IN_APP" ? "In-app" : c === "SMS" ? "SMS" : "WhatsApp"}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {(history.data ?? []).length === 0 && !history.isLoading && (
          <p className="text-center text-xs text-muted-foreground">
            Les locataires concernés sont ceux ayant un bail <button className="font-semibold text-primary hover:underline" onClick={() => navigate("/proprietaire/locataires")}>actif ou en préavis</button>.
          </p>
        )}
      </section>
    </div>
  );
}
