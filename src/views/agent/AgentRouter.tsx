"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : routeur interne
// Routes : /demarcheur, /demarcheur/catalogue, /demarcheur/liens,
// /demarcheur/commissions, /demarcheur/wallet
// ============================================================

import { useEffect } from "react";
import { useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { ErrorState } from "@/components/shared/states";
import { AgentDashboard } from "./AgentDashboard";
import { AgentCatalogue } from "./AgentCatalogue";
import { AgentLinks } from "./AgentLinks";
import { AgentCommissions } from "./AgentCommissions";
import { AgentWallet } from "./AgentWallet";

export default function AgentRouter({ route }: { route: string }) {
  const { user, loading } = useSession();

  // Garde de session : non connecté → connexion
  useEffect(() => {
    if (!loading && !user) navigate("/connexion", { replace: true });
  }, [loading, user]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (!user) return null;

  let view: React.ReactNode;
  switch (route) {
    case "/demarcheur/catalogue": view = <AgentCatalogue />; break;
    case "/demarcheur/liens": view = <AgentLinks />; break;
    case "/demarcheur/commissions": view = <AgentCommissions />; break;
    case "/demarcheur/wallet": view = <AgentWallet />; break;
    case "/demarcheur": view = <AgentDashboard />; break;
    default:
      view = (
        <div className="mx-auto max-w-7xl">
          <ErrorState message="Cette page de l'espace démarcheur n'existe pas." />
        </div>
      );
  }
  return <>{view}</>;
}
