"use client";

// ============================================================
// LocaBénin — AdminAudit : journal d'audit
// Table (date, acteur, action, entité, détails) + filtre par action
// + stats en chips + pagination simple (take/skip).
// ============================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/client/session";
import { formatDate } from "@/lib/finance";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminError, PageIntro } from "./components/bits";

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

interface AuditStats {
  action: string;
  count: number;
}

const PAGE_SIZE = 25;

/** Libellé français des actions d'audit. */
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    USER_SUSPEND: "Utilisateur suspendu",
    USER_BAN: "Utilisateur banni",
    USER_ACTIVATE: "Utilisateur réactivé",
    KYC_APPROVE: "KYC approuvé",
    KYC_REJECT: "KYC refusé",
    LISTING_APPROVE: "Offre approuvée",
    LISTING_REJECT: "Offre refusée",
    LISTING_SUSPEND: "Offre suspendue",
    LISTING_FEATURE: "Offre mise à la une",
    LISTING_UNFEATURE: "Offre retirée de la une",
    PAYOUT_APPROVE: "Retrait approuvé",
    PAYOUT_REJECT: "Retrait rejeté",
    COMMISSION_VALIDATE: "Commission validée",
    COMMISSION_CANCEL: "Commission annulée",
    REPORT_RESOLVE: "Signalement traité",
    REPORT_DISMISS: "Signalement rejeté",
    SETTING_UPDATE: "Paramètres modifiés",
    GEO_AREA_CREATE: "Quartier créé",
    GEO_AREA_DELETE: "Quartier supprimé",
  };
  return map[action] ?? action;
}

const ACTION_TONE: Record<string, string> = {
  KYC_APPROVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  LISTING_APPROVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  PAYOUT_APPROVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  COMMISSION_VALIDATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  REPORT_RESOLVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  GEO_AREA_CREATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  USER_ACTIVATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  USER_SUSPEND: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  USER_BAN: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  KYC_REJECT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  LISTING_REJECT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  LISTING_SUSPEND: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  PAYOUT_REJECT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  COMMISSION_CANCEL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  GEO_AREA_DELETE: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

/** Résumé lisible du metaJson. */
function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "—";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    const key = { reason: "motif", reference: "réf.", previousStatus: "avant", newStatus: "après", note: "note", amount: "montant", docsCount: "docs", userId: "utilisateur", agentId: "démarcheur", listingId: "offre", listing: "offre", total: "total", patchKeys: "clés", pricingCount: "tarifs", docsUpdated: "docs", nextStatus: "statut", suspendListing: "offre suspendue", resolution: "résolution", commune: "commune", department: "département", name: "nom", targetRoles: "rôles" }[k] ?? k;
    let value = v;
    if (typeof v === "number") value = new Intl.NumberFormat("fr-FR").format(v);
    else if (Array.isArray(v)) value = v.length > 0 ? v.join(", ") : "—";
    else if (typeof v === "object") continue;
    parts.push(`${key} : ${String(value)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AdminAudit() {
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(0);

  const statsQ = useQuery({
    queryKey: ["admin", "audit", "stats"],
    queryFn: () => apiGet<{ stats: AuditStats[] }>("/api/admin/audit?stats=1"),
  });

  const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
  if (action !== "ALL") params.set("action", action);
  const logsQ = useQuery({
    queryKey: ["admin", "audit", action, page],
    queryFn: () => apiGet<{ items: AuditItem[]; total: number }>(`/api/admin/audit?${params.toString()}`),
  });

  const items = logsQ.data?.items ?? [];
  const total = logsQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeFilter = (v: string) => {
    setAction(v);
    setPage(0);
  };

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Journal d'audit"
        description="Traçabilité complète des actions d'administration : acteur, entité, détails. Immuables et horodatés."
        actions={
          <Select value={action} onValueChange={changeFilter}>
            <SelectTrigger className="w-60" aria-label="Filtrer par type d'action">
              <SelectValue placeholder="Type d'action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les actions</SelectItem>
              {(statsQ.data?.stats ?? []).map((s) => (
                <SelectItem key={s.action} value={s.action}>
                  {actionLabel(s.action)} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Stats par action (chips) */}
      <div className="flex flex-wrap gap-1.5">
        {statsQ.isError && <AdminError error={statsQ.error} onRetry={() => void statsQ.refetch()} />}
        {(statsQ.data?.stats ?? []).map((s) => (
          <button
            key={s.action}
            type="button"
            onClick={() => changeFilter(action === s.action ? "ALL" : s.action)}
            aria-pressed={action === s.action}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              action === s.action ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/70 text-muted-foreground hover:bg-secondary"
            }`}
          >
            {actionLabel(s.action)}
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${action === s.action ? "bg-primary-foreground/20" : "bg-background"}`}>{s.count}</span>
          </button>
        ))}
        {statsQ.data && statsQ.data.stats.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucune action enregistrée pour le moment.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {logsQ.isError && <AdminError error={logsQ.error} onRetry={() => void logsQ.refetch()} />}
        {logsQ.isLoading && <div className="p-4"><RowsSkeleton rows={8} /></div>}
        {logsQ.data && items.length === 0 && (
          <EmptyState icon={ScrollText} title="Journal vide" description="Aucune action enregistrée pour ce filtre." className="border-0" />
        )}
        {logsQ.data && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Date</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(l.createdAt, true)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium">{l.actor?.fullName ?? "Système"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`whitespace-nowrap border-0 font-semibold ${ACTION_TONE[l.action] ?? "bg-muted"}`}>
                        {actionLabel(l.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.entityType}
                      {l.entityId && <span className="block max-w-28 truncate font-mono text-[10px]" title={l.entityId}>{l.entityId}</span>}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">{metaSummary(l.meta)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {logsQ.data && items.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} / {pageCount} — {total} entrée(s)
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Page précédente">
                <ChevronLeft className="size-4" aria-hidden /> Précédent
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
                Suivant <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
