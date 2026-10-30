"use client";

// ============================================================
// LocaBénin — AdminPayments : paiements + webhooks
// Onglet Paiements : table filtrable (statut / motif).
// Onglet Webhooks : payment_events récents (idempotence, erreurs).
// ============================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Webhook, CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { apiGet } from "@/lib/client/session";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AdminError, PageIntro, initials } from "./components/bits";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AdminPayment {
  id: string;
  reference: string;
  purpose: string;
  amount: number;
  method: string;
  status: string;
  provider: string;
  failureReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  payer: { id: string; fullName: string; phone: string | null; avatarUrl: string | null };
  objectLabel: string;
  breakdown: Array<{ label: string; amount: number }>;
}

interface AdminPaymentEvent {
  id: string;
  provider: string;
  eventId: string;
  type: string;
  signatureValid: boolean;
  processedAt: string | null;
  processingError: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  "payment.succeeded": "Paiement réussi",
  "payment.failed": "Paiement échoué",
  "payment.refunded": "Remboursement",
};

export default function AdminPayments() {
  const [status, setStatus] = useState("ALL");
  const [purpose, setPurpose] = useState("ALL");

  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (purpose !== "ALL") params.set("purpose", purpose);
  const qs = params.toString();

  const paymentsQ = useQuery({
    queryKey: ["admin", "payments", status, purpose],
    queryFn: () => apiGet<{ items: AdminPayment[]; total: number }>(`/api/admin/payments${qs ? `?${qs}` : ""}`),
  });
  const eventsQ = useQuery({
    queryKey: ["admin", "payments", "events"],
    queryFn: () => apiGet<{ events: AdminPaymentEvent[] }>("/api/admin/payments?events=1"),
  });

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Paiements"
        description="Flux financier de la plateforme : loyers, entrées, réservations et abonnements. Onglet Webhooks : transparence du pipeline idempotent."
      />

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments" className="gap-2"><CreditCard className="size-4" aria-hidden /> Paiements</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="size-4" aria-hidden /> Webhooks</TabsTrigger>
        </TabsList>

        {/* --- Paiements --- */}
        <TabsContent value="payments" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {["SUCCESS", "PENDING", "FAILED", "REFUNDED", "DISPUTED", "INITIATED", "CANCELLED"].map((s) => (
                  <SelectItem key={s} value={s}>{label(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrer par motif">
                <SelectValue placeholder="Motif" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les motifs</SelectItem>
                {["INITIAL", "RENT", "BOOKING", "SUBSCRIPTION", "DEPOSIT_RETURN"].map((p) => (
                  <SelectItem key={p} value={p}>{label(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            {paymentsQ.isError && <AdminError error={paymentsQ.error} onRetry={() => void paymentsQ.refetch()} />}
            {paymentsQ.isLoading && <div className="p-4"><RowsSkeleton rows={8} /></div>}
            {paymentsQ.data && paymentsQ.data.items.length === 0 && (
              <EmptyState icon={CreditCard} title="Aucun paiement" description="Aucun paiement ne correspond à ces filtres." className="border-0" />
            )}
            {paymentsQ.data && paymentsQ.data.items.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      <TableHead>Payeur</TableHead>
                      <TableHead>Objet</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsQ.data.items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <p className="font-mono text-xs font-semibold">{p.reference}</p>
                          <p className="text-[11px] text-muted-foreground md:hidden">{formatDate(p.createdAt, true)}</p>
                          {p.failureReason && <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{p.failureReason}</p>}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDate(p.confirmedAt ?? p.createdAt, true)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7">
                              <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">{initials(p.payer.fullName)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{p.payer.fullName}</p>
                              <p className="text-[11px] text-muted-foreground">{p.payer.phone ?? "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-52">
                          <Badge variant="outline" className="mb-1 border-0 bg-secondary font-medium">{label(p.purpose)}</Badge>
                          <p className="truncate text-xs text-muted-foreground">{p.objectLabel}</p>
                        </TableCell>
                        <TableCell className="text-xs">{label(p.method)}<span className="block text-[11px] text-muted-foreground">{p.provider}</span></TableCell>
                        <TableCell className="text-right font-display text-sm font-bold">{formatFcfa(p.amount)}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {paymentsQ.data && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                {paymentsQ.data.items.length} paiement(s) affiché(s) sur {paymentsQ.data.total} — 50 derniers résultats.
              </p>
            )}
          </div>
        </TabsContent>

        {/* --- Webhooks --- */}
        <TabsContent value="webhooks">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Pipeline des webhooks opérateurs</p>
              <p className="text-xs text-muted-foreground">
                Chaque événement est enregistré avec une clé d&apos;idempotence unique (eventId) : un rejeu ne produit jamais de double effet métier. Les erreurs de traitement sont visibles en rouge.
              </p>
            </div>
            {eventsQ.isError && <AdminError error={eventsQ.error} onRetry={() => void eventsQ.refetch()} />}
            {eventsQ.isLoading && <div className="p-4"><RowsSkeleton rows={6} /></div>}
            {eventsQ.data && eventsQ.data.events.length === 0 && (
              <EmptyState icon={Webhook} title="Aucun événement" description="Aucun webhook opérateur reçu pour le moment." className="border-0" />
            )}
            {eventsQ.data && eventsQ.data.events.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Fournisseur</TableHead>
                      <TableHead>Signature</TableHead>
                      <TableHead>Traité à</TableHead>
                      <TableHead>Traitement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsQ.data.events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="max-w-44 truncate font-mono text-xs" title={e.eventId}>{e.eventId}</TableCell>
                        <TableCell className="text-xs font-medium">{EVENT_LABELS[e.type] ?? e.type}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{e.provider}</TableCell>
                        <TableCell>
                          {e.signatureValid ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <CircleCheck className="size-3.5" aria-hidden /> Valide
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                              <CircleAlert className="size-3.5" aria-hidden /> Invalide
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.processedAt ? formatDate(e.processedAt, true) : <span className="text-amber-700 dark:text-amber-400">En attente</span>}</TableCell>
                        <TableCell>
                          {e.processingError ? (
                            <span className="inline-flex max-w-64 items-start gap-1 text-xs font-medium text-red-600 dark:text-red-400" title={e.processingError}>
                              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                              <span className="line-clamp-2">{e.processingError}</span>
                            </span>
                          ) : e.processedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <CircleCheck className="size-3.5" aria-hidden /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CircleMinus className="size-3.5" aria-hidden /> Non traité
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {eventsQ.data && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">20 derniers événements — reçus le {formatDate(eventsQ.data.events[0]?.createdAt ?? new Date(), true)} au plus récent.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
