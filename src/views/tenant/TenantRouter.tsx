"use client";

// ============================================================
// LocaBénin — Espace Locataire : routeur interne
// Recoit la route hash de la coquille et affiche la vue correspondante.
// Routes : /locataire, /locataire/candidatures, /locataire/bail,
// /locataire/documents, /locataire/reparations, /locataire/profil
// et /favoris (routé vers ce module).
// ============================================================

import { useEffect } from "react";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { ErrorState } from "@/components/shared/states";
import { TenantDashboard } from "./TenantDashboard";
import { TenantLease } from "./TenantLease";
import { TenantFavorites } from "./TenantFavorites";
import { TenantApplications } from "./TenantApplications";
import { TenantDocuments } from "./TenantDocuments";
import { TenantTickets } from "./TenantTickets";
import { TenantProfile } from "./TenantProfile";

export default function TenantRouter({ route }: { route: string }) {
  const { user, loading } = useSession();

  // Garde de session : non connecté → connexion
  useEffect(() => {
    if (!loading && !user) navigate("/connexion", { replace: true });
  }, [loading, user]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }
  if (!user) return null;

  let view: React.ReactNode;
  switch (route) {
    case "/locataire/candidatures": view = <TenantApplications />; break;
    case "/locataire/bail": view = <TenantLease />; break;
    case "/locataire/documents": view = <TenantDocuments />; break;
    case "/locataire/reparations": view = <TenantTickets />; break;
    case "/locataire/profil": view = <TenantProfile />; break;
    case "/favoris": view = <TenantFavorites />; break;
    case "/locataire": view = <TenantDashboard />; break;
    default:
      view = (
        <div className="mx-auto max-w-7xl">
          <ErrorState message="Cette page de l'espace locataire n'existe pas." />
        </div>
      );
  }
  return <>{view}</>;
}
