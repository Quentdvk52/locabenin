"use client";

// ============================================================
// LocaBénin — Visites & candidatures (propriétaire)
// Onglet Visites : confirmer / refuser / terminer + message.
// Onglet Candidatures : accepter / refuser ; si acceptée sans bail,
// création inline du bail (startDate + durée) → échéancier généré.
// ============================================================

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  CalendarDays, Users, MapPin, MessageSquare, Check, X, CheckCheck, KeyRound, Loader2, ChevronDown, Phone,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { StatusBadge, KycBadge } from "@/components/shared/badges";
import { EmptyState, ErrorState, CardsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ViewHeader } from "./components/ViewHeader";
import { handleApiError, initials, formatDateFr, toDateInput } from "./components/helpers";
import { cn } from "@/lib/utils";

interface VisitRow {
  id: string;
  listing: { id: string; title: string; reference: string };
  tenant: { id: string; fullName: string; phone: string | null };
  scheduledAt: string;
  status: string;
  note: string | null;
}
interface ApplicationRow {
  id: string;
  leaseId: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  listing: { id: string; title: string; reference: string; rentAmount: number; rentPeriod: string; genre: string };
  tenant: { id: string; fullName: string; phone: string | null; kycStatus: string };
}

/** Période en français (mois, trimestre, semestre, an, jour, semaine). */
function periodLabel(period: string): string {
  const map: Record<string, string> = { DAY: "jour", WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre", SEMESTER: "semestre", LEASE: "an" };
  return map[period] ?? period.toLowerCase();
}

export default function OwnerVisits() {
  const qc = useQueryClient();

  const visits = useQuery<VisitRow[]>({
    queryKey: ["visits", "owner"],
    queryFn: () => apiGet<VisitRow[]>("/api/visits"),
  });
  const applications = useQuery<ApplicationRow[]>({
    queryKey: ["applications", "owner"],
    queryFn: () => apiGet<ApplicationRow[]>("/api/applications"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["visits"] });
    void qc.invalidateQueries({ queryKey: ["applications"] });
    void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
  };

  const visitMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiSend("/api/visits", "PATCH", { id, status }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.status === "CONFIRMED" ? "Visite confirmée — le locataire est notifié." :
        vars.status === "REJECTED" ? "Visite refusée." : "Visite marquée comme effectuée.",
      );
      invalidate();
    },
    onError: (e) => handleApiError(e, "Action impossible."),
  });

  const appMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiSend("/api/applications", "PATCH", { id, status }),
    onSuccess: (_res, vars) => {
      if (vars.status === "ACCEPTED") toast.success("Candidature acceptée.", { description: "Créez le bail pour générer l'échéancier." });
      else toast.success("Candidature refusée — le locataire est notifié.");
      invalidate();
    },
    onError: (e) => handleApiError(e, "Action impossible."),
  });

  const msgMutation = useMutation({
    mutationFn: ({ recipientId, listingId }: { recipientId: string; listingId: string }) =>
      apiSend<{ conversationId: string }>("/api/conversations", "POST", {
        recipientId, listingId, message: "Bonjour, je vous contacte au sujet de votre visite / candidature.",
      }),
    onSuccess: (res) => navigate(`/messagerie?c=${res.conversationId}`),
    onError: (e) => handleApiError(e, "Envoi du message impossible."),
  });

  const visitsSorted = [...(visits.data ?? [])].sort((a, b) => {
    const active = (v: VisitRow) => (v.status === "REQUESTED" || v.status === "CONFIRMED" ? 0 : 1);
    return active(a) - active(b) || new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader
        title="Visites & candidatures"
        subtitle="Traitez les demandes de vos futurs locataires"
        icon={CalendarDays}
      />

      <Tabs defaultValue="visits">
        <TabsList>
          <TabsTrigger value="visits">Visites {(visits.data ?? []).filter((v) => v.status === "REQUESTED").length > 0 && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">{(visits.data ?? []).filter((v) => v.status === "REQUESTED").length}</span>}</TabsTrigger>
          <TabsTrigger value="applications">Candidatures {(applications.data ?? []).filter((a) => a.status === "PENDING").length > 0 && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">{(applications.data ?? []).filter((a) => a.status === "PENDING").length}</span>}</TabsTrigger>
        </TabsList>

        {/* ---------------- VISITES ---------------- */}
        <TabsContent value="visits" className="mt-4">
          {visits.isLoading ? (
            <CardsSkeleton count={4} />
          ) : visits.isError ? (
            <ErrorState message="Impossible de charger les visites." onRetry={() => void visits.refetch()} />
          ) : visitsSorted.length === 0 ? (
            <EmptyState
              title="Aucune demande de visite"
              description="Dès qu'un locataire demande à visiter vos offres, la demande apparaît ici."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visitsSorted.map((v) => (
                <article key={v.id} className="rounded-2xl border bg-card p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary" aria-hidden>
                        {initials(v.tenant.fullName)}
                      </span>
                      <div>
                        <h3 className="font-display text-sm font-bold">{v.tenant.fullName}</h3>
                        <p className="text-xs text-muted-foreground">{v.tenant.phone ?? "—"}</p>
                      </div>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-semibold"><MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> {v.listing.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Demandée pour le <strong>{formatDateFr(v.scheduledAt, true)}</strong></p>
                    {v.note && <p className="mt-1.5 border-t pt-1.5 text-xs text-muted-foreground">« {v.note} »</p>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {v.status === "REQUESTED" && (
                      <>
                        <Button size="sm" className="h-9" onClick={() => visitMutation.mutate({ id: v.id, status: "CONFIRMED" })} disabled={visitMutation.isPending}>
                          <Check className="size-4" aria-hidden /> Confirmer
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 text-red-600 hover:text-red-600" onClick={() => visitMutation.mutate({ id: v.id, status: "REJECTED" })} disabled={visitMutation.isPending}>
                          <X className="size-4" aria-hidden /> Refuser
                        </Button>
                      </>
                    )}
                    {v.status === "CONFIRMED" && (
                      <Button size="sm" className="h-9" onClick={() => visitMutation.mutate({ id: v.id, status: "DONE" })} disabled={visitMutation.isPending}>
                        <CheckCheck className="size-4" aria-hidden /> Marquer comme effectuée
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-9" onClick={() => msgMutation.mutate({ recipientId: v.tenant.id, listingId: v.listing.id })} disabled={msgMutation.isPending}>
                      <MessageSquare className="size-4" aria-hidden /> Message
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- CANDIDATURES ---------------- */}
        <TabsContent value="applications" className="mt-4">
          {applications.isLoading ? (
            <CardsSkeleton count={4} />
          ) : applications.isError ? (
            <ErrorState message="Impossible de charger les candidatures." onRetry={() => void applications.refetch()} />
          ) : (applications.data ?? []).length === 0 ? (
            <EmptyState
              title="Aucune candidature"
              description="Les dossiers de location déposés sur vos offres apparaîtront ici."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(applications.data ?? []).map((a) => (
                <ApplicationCard
                  key={a.id}
                  app={a}
                  busy={appMutation.isPending || msgMutation.isPending}
                  onDecide={(status) => appMutation.mutate({ id: a.id, status })}
                  onMessage={() => msgMutation.mutate({ recipientId: a.tenant.id, listingId: a.listing.id })}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApplicationCard({
  app, onDecide, onMessage, busy,
}: {
  app: ApplicationRow;
  onDecide: (status: "ACCEPTED" | "REJECTED") => void;
  onMessage: () => void;
  busy: boolean;
}) {
  const qc = useQueryClient();
  const [leaseOpen, setLeaseOpen] = useState(false);
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [leaseMonths, setLeaseMonths] = useState("12");
  const [creating, setCreating] = useState(false);

  async function createLease() {
    setCreating(true);
    try {
      await apiSend("/api/leases", "POST", { applicationId: app.id, startDate, leaseMonths: parseInt(leaseMonths, 10), allowPartial: false });
      toast.success("Bail créé.", { description: "Le locataire doit payer l'entrée pour activer la location." });
      setLeaseOpen(false);
      void qc.invalidateQueries({ queryKey: ["applications"] });
      void qc.invalidateQueries({ queryKey: ["owner", "tenants"] });
      void qc.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    } catch (e) {
      handleApiError(e, "Création du bail impossible.");
    } finally {
      setCreating(false);
    }
  }

  const canCreateLease = app.status === "ACCEPTED" && !app.leaseId && app.listing.genre !== "FURNISHED";

  return (
    <article className={cn("rounded-2xl border bg-card p-5 shadow-soft", app.status === "PENDING" && "border-amber-300/60 dark:border-amber-900/60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary" aria-hidden>
            {initials(app.tenant.fullName)}
          </span>
          <div>
            <h3 className="font-display text-sm font-bold">{app.tenant.fullName}</h3>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" aria-hidden /> {app.tenant.phone ?? "—"}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={app.status} />
          <KycBadge status={app.tenant.kycStatus} />
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">
        <p className="font-semibold">{app.listing.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatFcfa(app.listing.rentAmount)} / {periodLabel(app.listing.rentPeriod)} · déposée le {formatDateFr(app.createdAt)}
        </p>
        {app.message && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">« {app.message} »</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {app.status === "PENDING" && (
          <>
            <Button size="sm" className="h-9" onClick={() => onDecide("ACCEPTED")} disabled={busy}>
              <Check className="size-4" aria-hidden /> Accepter
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-red-600 hover:text-red-600" onClick={() => onDecide("REJECTED")} disabled={busy}>
              <X className="size-4" aria-hidden /> Refuser
            </Button>
          </>
        )}
        {canCreateLease && (
          <Button size="sm" variant="secondary" className="h-9" onClick={() => setLeaseOpen((o) => !o)} aria-expanded={leaseOpen}>
            <KeyRound className="size-4" aria-hidden /> Créer le bail
            <ChevronDown className={cn("size-4 transition-transform", leaseOpen && "rotate-180")} aria-hidden />
          </Button>
        )}
        {app.leaseId && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => navigate("/proprietaire/locataires")}>
            <Users className="size-4" aria-hidden /> Voir dans mes locataires
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-9" onClick={onMessage} disabled={busy}>
          <MessageSquare className="size-4" aria-hidden /> Message
        </Button>
      </div>

      {leaseOpen && canCreateLease && (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`sd-${app.id}`} className="text-xs">Date de début du bail</Label>
            <Input id={`sd-${app.id}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" />
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label htmlFor={`lm-${app.id}`} className="text-xs">Durée</Label>
            <Select value={leaseMonths} onValueChange={setLeaseMonths}>
              <SelectTrigger id={`lm-${app.id}`} className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 mois</SelectItem>
                <SelectItem value="12">12 mois</SelectItem>
                <SelectItem value="24">24 mois</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10" disabled={creating || !startDate} onClick={() => void createLease()}>
            {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            Créer le bail
          </Button>
        </div>
      )}
    </article>
  );
}
