"use client";

// ============================================================
// LocaBénin — Espace Locataire : profil & KYC
// Résumé de session, gestion des rôles (multi-espaces), déconnexion.
// Le KYC complet est géré par la page « /compte » (redirection douce).
// ============================================================

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserCircle2, ShieldCheck, LogOut, ArrowRight, Loader2, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { KycBadge } from "@/components/shared/badges";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { label, type Role } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLE_HOME: Record<Role, string> = {
  OWNER: "/proprietaire",
  TENANT: "/locataire",
  AGENT: "/demarcheur",
  ADMIN: "/admin",
};

export function TenantProfile() {
  const { user, switchRole, logout } = useSession();
  const qc = useQueryClient();
  const [switching, setSwitching] = useState<Role | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function activateRole(role: Role) {
    if (!user || role === user.activeRole) return;
    setSwitching(role);
    try {
      await switchRole(role);
      toast.success(`Espace ${label(role)} activé.`);
      navigate(ROLE_HOME[role]);
    } catch {
      toast.error("Changement d'espace impossible.");
    } finally {
      setSwitching(null);
    }
  }

  async function doLogout() {
    setLoggingOut(true);
    try {
      await logout();
      qc.clear();
      navigate("/");
      toast.success("Vous êtes déconnecté. À bientôt !");
    } catch {
      toast.error("Déconnexion impossible.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Profil &amp; vérification</h2>
        <p className="text-sm text-muted-foreground">Votre identité, vos espaces et votre vérification d&apos;identité (KYC).</p>
      </div>

      {/* Carte profil */}
      <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Mes informations">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-16 border">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
            <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
              {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg font-bold">{user.fullName}</h3>
            <p className="truncate text-sm text-muted-foreground">{user.phone ?? user.email ?? "—"}</p>
            <div className="mt-1.5"><KycBadge status={user.kycStatus} /></div>
          </div>
        </div>
      </section>

      {/* KYC — redirection douce vers la page compte */}
      <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Vérification d'identité">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <IdCard className="size-5 text-primary" aria-hidden /> Vérification d&apos;identité (KYC)
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {user.kycStatus === "VERIFIED"
            ? "Votre identité est vérifiée : tous les services sont débloqués (retraits, signatures, candidatures prioritaires)."
            : "Vérifiez votre identité (pièce d'identité + selfie) pour débloquer l'ensemble des services et renforcer la confiance avec votre bailleur."}
        </p>
        <Button className="mt-3 min-h-[44px]" onClick={() => navigate("/compte")}>
          {user.kycStatus === "VERIFIED" ? "Gérer mon compte" : "Vérifier mon identité"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </section>

      {/* Mes espaces (rôles) */}
      <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Mes espaces">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <UserCircle2 className="size-5 text-primary" aria-hidden /> Mes espaces
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Un compte LocaBénin peut être à la fois locataire, propriétaire et démarcheur.</p>
        <ul className="mt-3 divide-y">
          {user.roles.map((r) => {
            const active = r === user.activeRole;
            return (
              <li key={r} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{label(r)}</p>
                    {active && <p className="text-xs text-primary">Espace actuel</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  className="min-h-[44px]"
                  disabled={active || switching !== null}
                  onClick={() => void activateRole(r)}
                >
                  {switching === r && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {active ? "Actif" : "Activer"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Déconnexion */}
      <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-label="Session">
        <h3 className="flex items-center gap-2 font-display text-base font-bold"><LogOut className="size-5 text-primary" aria-hidden /> Session</h3>
        <p className="mt-1 text-sm text-muted-foreground">Déconnectez-vous de cet appareil. Vos documents restent archivés dans votre coffre-fort.</p>
        <Button variant="destructive" className="mt-3 min-h-[44px]" disabled={loggingOut} onClick={() => void doLogout()}>
          {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
          Se déconnecter
        </Button>
      </section>
    </div>
  );
}
