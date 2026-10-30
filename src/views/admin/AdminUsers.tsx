"use client";

// ============================================================
// LocaBénin — AdminUsers : gestion des utilisateurs
// Recherche debounced + filtres statut/rôle, table dense,
// menu d'actions (suspendre / réactiver / bannir) avec confirmation
// + motif, détail en Dialog (rôles, offres, baux).
// ============================================================

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Search, Eye, PauseCircle, Play, Ban, Loader2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { KycBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { AdminError, PageIntro, initials } from "./components/bits";

interface AdminUserRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  status: string;
  kycStatus: string;
  createdAt: string;
  roles: string[];
  adminSubRole: string | null;
  listingsCount: number;
}

interface AdminUserDetail {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  status: string;
  kycStatus: string;
  createdAt: string;
  roles: Array<{ role: string; adminSubRole: string | null; isDefault: boolean }>;
  counts: {
    listings: number; leasesAsOwner: number; leasesAsTenant: number;
    payments: number; reportsFiled: number; commissions: number; payouts: number; kycDocuments: number;
  };
}

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  TENANT: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  AGENT: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
  ADMIN: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [confirm, setConfirm] = useState<{ user: AdminUserRow; action: "suspend" | "activate" | "ban" } | null>(null);
  const [reason, setReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Debounce de la recherche (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (debounced) params.set("query", debounced);
  if (status !== "ALL") params.set("status", status);
  if (role !== "ALL") params.set("role", role);
  const qs = params.toString();

  const usersQ = useQuery({
    queryKey: ["admin", "users", debounced, status, role],
    queryFn: () => apiGet<{ items: AdminUserRow[]; total: number }>(`/api/admin/users${qs ? `?${qs}` : ""}`),
  });

  const act = useMutation({
    mutationFn: (vars: { id: string; action: string; reason?: string }) => apiSend("/api/admin/users", "PATCH", vars),
    onSuccess: (_d, vars) => {
      const messages: Record<string, string> = { suspend: "Compte suspendu", activate: "Compte réactivé", ban: "Compte banni" };
      toast.success(messages[vars.action] ?? "Action effectuée");
      setConfirm(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action impossible"),
  });

  const confirmTitle: Record<string, string> = { suspend: "Suspendre ce compte ?", activate: "Réactiver ce compte ?", ban: "Bannir définitivement ce compte ?" };
  const confirmDesc: Record<string, string> = {
    suspend: "L'utilisateur ne pourra plus se connecter tant que son compte est suspendu.",
    activate: "L'utilisateur retrouvera l'accès complet à la plateforme.",
    ban: "Le compte sera définitivement désactivé. Cette mesure est réservée aux cas graves (fraude, arnaque).",
  };
  const needsReason = confirm?.action === "suspend" || confirm?.action === "ban";

  return (
    <div className="space-y-5 py-2">
      <PageIntro
        title="Utilisateurs"
        description="Comptes de la plateforme : propriétaires, locataires, démarcheurs et administrateurs."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou e-mail…"
            className="pl-9"
            aria-label="Rechercher un utilisateur"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            <SelectItem value="ACTIVE">{label("ACTIVE")}</SelectItem>
            <SelectItem value="SUSPENDED">{label("SUSPENDED")}</SelectItem>
            <SelectItem value="BANNED">{label("BANNED")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par rôle">
            <SelectValue placeholder="Rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les rôles</SelectItem>
            <SelectItem value="OWNER">{label("OWNER")}</SelectItem>
            <SelectItem value="TENANT">{label("TENANT")}</SelectItem>
            <SelectItem value="AGENT">{label("AGENT")}</SelectItem>
            <SelectItem value="ADMIN">{label("ADMIN")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {usersQ.isError && <AdminError error={usersQ.error} onRetry={() => void usersQ.refetch()} />}
        {usersQ.isLoading && <div className="p-4"><RowsSkeleton rows={8} /></div>}
        {usersQ.data && usersQ.data.items.length === 0 && (
          <EmptyState icon={UsersIcon} title="Aucun utilisateur trouvé" description="Ajustez la recherche ou les filtres." className="border-0" />
        )}
        {usersQ.data && usersQ.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôles</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead className="text-center">Offres</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Inscription</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQ.data.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.fullName} />}
                          <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{initials(u.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{u.fullName}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.phone ?? u.email ?? "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="outline" className={`border-0 font-medium ${ROLE_COLORS[r] ?? "bg-muted"}`}>
                            {r === "ADMIN" && u.adminSubRole ? label(u.adminSubRole) : label(r)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><KycBadge status={u.kycStatus} /></TableCell>
                    <TableCell className="text-center text-sm font-semibold">{u.listingsCount}</TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions pour ${u.fullName}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setDetailId(u.id)}>
                            <Eye className="mr-2 size-4" /> Voir le détail
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.status === "ACTIVE" ? (
                            <DropdownMenuItem onClick={() => { setConfirm({ user: u, action: "suspend" }); setReason(""); }}>
                              <PauseCircle className="mr-2 size-4" /> Suspendre
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setConfirm({ user: u, action: "activate" })}>
                              <Play className="mr-2 size-4" /> Réactiver
                            </DropdownMenuItem>
                          )}
                          {u.status !== "BANNED" && (
                            <DropdownMenuItem className="text-red-600 focus:text-red-600 dark:text-red-400" onClick={() => { setConfirm({ user: u, action: "ban" }); setReason(""); }}>
                              <Ban className="mr-2 size-4" /> Bannir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {usersQ.data && (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {usersQ.data.items.length} utilisateur(s) affiché(s) sur {usersQ.data.total} — 50 premiers résultats.
          </p>
        )}
      </div>

      {/* Confirmation d'action (AlertDialog) */}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? confirmTitle[confirm.action] : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? `${confirm.user.fullName} — ${confirmDesc[confirm.action]}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsReason && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Motif (communiqué à l'utilisateur dans sa notification)"
              aria-label="Motif de l'action"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "ban" ? "bg-red-600 text-white hover:bg-red-700" : ""}
              disabled={act.isPending || (needsReason && reason.trim().length < 3)}
              onClick={() => {
                if (!confirm) return;
                act.mutate({ id: confirm.user.id, action: confirm.action, reason: reason.trim() || undefined });
              }}
            >
              {act.isPending && <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />} Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Détail utilisateur */}
      <UserDetailDialog userId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function UserDetailDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin", "users", "detail", userId],
    queryFn: () => apiGet<AdminUserDetail>(`/api/admin/users/${userId}`),
    enabled: userId !== null,
  });

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Détail de l&apos;utilisateur</DialogTitle>
          <DialogDescription>{q.data ? q.data.fullName : "Chargement…"}</DialogDescription>
        </DialogHeader>
        {q.isError && <AdminError error={q.error} onRetry={() => void q.refetch()} />}
        {q.isLoading && <RowsSkeleton rows={4} />}
        {q.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-secondary/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className="font-semibold">{q.data.phone ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-secondary/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="truncate font-semibold">{q.data.email ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rôles</p>
              <div className="flex flex-wrap gap-1.5">
                {q.data.roles.map((r) => (
                  <Badge key={r.role} variant="outline" className={`border-0 ${ROLE_COLORS[r.role] ?? "bg-muted"}`}>
                    {r.role === "ADMIN" && r.adminSubRole ? label(r.adminSubRole) : label(r.role)}
                    {r.isDefault ? " (défaut)" : ""}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activité</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Offres" value={q.data.counts.listings} />
                <Stat label="Baux (bailleur)" value={q.data.counts.leasesAsOwner} />
                <Stat label="Baux (locataire)" value={q.data.counts.leasesAsTenant} />
                <Stat label="Paiements" value={q.data.counts.payments} />
                <Stat label="Commissions" value={q.data.counts.commissions} />
                <Stat label="Signalements déposés" value={q.data.counts.reportsFiled} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Inscrit le {formatDate(q.data.createdAt)} · statut du compte : {label(q.data.status)} · KYC : {label(q.data.kycStatus)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label: l, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/60 px-3 py-2 text-center">
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{l}</p>
    </div>
  );
}
