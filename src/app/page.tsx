"use client";

// ============================================================
// LocaBénin — Coquille applicative (route unique /)
// Routeur hash + chargement paresseux des vues.
// Migration production : chaque vue devient une route App Router
// native (voir docs/ROUTES.md — l'arborescence cible y est décrite).
// ============================================================

import dynamic from "next/dynamic";
import { useRoute } from "@/lib/client/router";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicHeader, PublicTabBar, DashboardShell, SpaceTabBar, type SpaceNavItem } from "@/components/layout/chrome";
import { navIcons } from "@/components/layout/chrome";
import { useSession } from "@/lib/client/session";
import type { Role } from "@/lib/constants";
import { useEffect } from "react";

function ViewLoader() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
      <Skeleton className="h-10 w-2/3 max-w-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

// Vues publiques (rendu client ; le SEO statique est porté par les metadata
// du layout + JSON-LD injecté par les vues — voir docs/ROUTES.md)
const LandingView = dynamic(() => import("@/views/public/LandingView"), { loading: ViewLoader });
const SearchView = dynamic(() => import("@/views/public/SearchView"), { loading: ViewLoader });
const ListingDetailView = dynamic(() => import("@/views/public/ListingDetailView"), { loading: ViewLoader });
const StaticPageView = dynamic(() => import("@/views/public/StaticPageView"), { loading: ViewLoader });

// Auth
const AuthView = dynamic(() => import("@/views/auth/AuthView"), { loading: ViewLoader });

// Messagerie + compte (transverses)
const MessagingView = dynamic(() => import("@/views/messaging/MessagingView"), { loading: ViewLoader });
const AccountView = dynamic(() => import("@/views/account/AccountView"), { loading: ViewLoader });

// Espaces
const OwnerRouter = dynamic(() => import("@/views/owner/OwnerRouter"), { loading: ViewLoader });
const TenantRouter = dynamic(() => import("@/views/tenant/TenantRouter"), { loading: ViewLoader });
const AgentRouter = dynamic(() => import("@/views/agent/AgentRouter"), { loading: ViewLoader });
const AdminRouter = dynamic(() => import("@/views/admin/AdminRouter"), { loading: ViewLoader });

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="mt-4 font-display text-xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-sm text-muted-foreground">Le lien que vous avez suivi n&apos;existe pas ou a été déplacé.</p>
      <button onClick={() => (window.location.hash = "#/")} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft">
        Retour à l&apos;accueil
      </button>
    </div>
  );
}

/** Redirige vers l'espace du rôle actif. */
function RoleHome() {
  const { user, loading } = useSession();
  useEffect(() => {
    if (!loading && user) {
      const map: Record<string, string> = { OWNER: "#/proprietaire", TENANT: "#/locataire", AGENT: "#/demarcheur", ADMIN: "#/admin" };
      window.location.hash = map[user.activeRole] ?? "#/";
    } else if (!loading && !user) {
      window.location.hash = "#/connexion";
    }
  }, [user, loading]);
  return <ViewLoader />;
}

export default function AppShell() {
  const route = useRoute();
  const seg = route.segments;
  const p0 = seg[0] ?? "";
  const isPublicChrome = ["", "recherche", "offres", "villes", "securite", "arnaques", "devenir-demarcheur", "connexion"].includes(p0);
  const { user, loading } = useSession();

  // Garde d'espace : si l'utilisateur n'a pas le rôle requis → écran de garde
  const spaceGuards: Record<string, Role[]> = {
    proprietaire: ["OWNER", "ADMIN"],
    locataire: ["TENANT", "ADMIN"],
    demarcheur: ["AGENT", "ADMIN"],
    admin: ["ADMIN"],
  };
  const guard = spaceGuards[p0];
  const hasAccess = !guard || (user && (user.roles.includes(guard[0]) || (guard[1] && user.roles.includes(guard[1]) && user.activeRole === guard[0])));

  let view: React.ReactNode;
  if (p0 === "") view = <LandingView />;
  else if (p0 === "recherche") view = <SearchView />;
  else if (p0 === "offres" && seg[1]) view = <ListingDetailView listingId={seg[1]} />;
  else if (["villes", "securite", "arnaques", "devenir-demarcheur", "a-propos"].includes(p0)) view = <StaticPageView slug={p0} />;
  else if (p0 === "connexion") view = <AuthView />;
  else if (p0 === "messagerie") view = <MessagingView />;
  else if (p0 === "compte") view = <AccountView />;
  else if (p0 === "favoris" || p0 === "locataire") view = <TenantRouter route={route.path} />;
  else if (p0 === "proprietaire") view = <OwnerRouter route={route.path} />;
  else if (p0 === "demarcheur") view = <AgentRouter route={route.path} />;
  else if (p0 === "admin") view = <AdminRouter route={route.path} />;
  else view = <NotFound />;

  // Espaces avec chrome dashboard
  const dashboardRoutes: Record<string, { title: string; nav: SpaceNavItem[] }> = {
    proprietaire: {
      title: "Espace Propriétaire",
      nav: [
        { href: "/proprietaire", label: "Tableau de bord", icon: navIcons.LayoutDashboard },
        { href: "/proprietaire/biens", label: "Mes biens & offres", icon: navIcons.Building2 },
        { href: "/proprietaire/locataires", label: "Mes locataires", icon: navIcons.Users },
        { href: "/proprietaire/visites", label: "Visites & candidatures", icon: navIcons.CalendarDays },
        { href: "/proprietaire/messages", label: "Messagerie", icon: navIcons.MessageSquare },
        { href: "/proprietaire/finances", label: "Finances", icon: navIcons.Wallet },
        { href: "/proprietaire/abonnement", label: "Abonnement", icon: navIcons.CreditCard },
        { href: "/proprietaire/reparations", label: "Réparations", icon: navIcons.Wrench },
        { href: "/proprietaire/annonces", label: "Annonces groupées", icon: navIcons.Megaphone },
        { href: "/proprietaire/kyc", label: "Vérification (KYC)", icon: navIcons.ShieldCheck },
      ],
    },
    locataire: {
      title: "Espace Locataire",
      nav: [
        { href: "/locataire", label: "Tableau de bord", icon: navIcons.LayoutDashboard },
        { href: "/favoris", label: "Favoris & recherches", icon: navIcons.Heart },
        { href: "/locataire/candidatures", label: "Mes candidatures", icon: navIcons.FileText },
        { href: "/locataire/bail", label: "Mon bail & loyer", icon: navIcons.KeyRound },
        { href: "/locataire/documents", label: "Coffre-fort", icon: navIcons.FileText },
        { href: "/locataire/reparations", label: "Mes tickets", icon: navIcons.Wrench },
        { href: "/messagerie", label: "Messagerie", icon: navIcons.MessageSquare },
        { href: "/locataire/profil", label: "Profil & KYC", icon: navIcons.User },
      ],
    },
    demarcheur: {
      title: "Espace Démarcheur",
      nav: [
        { href: "/demarcheur", label: "Tableau de bord", icon: navIcons.LayoutDashboard },
        { href: "/demarcheur/catalogue", label: "Catalogue affiliable", icon: navIcons.Search },
        { href: "/demarcheur/liens", label: "Mes liens & QR", icon: navIcons.MapPin },
        { href: "/demarcheur/commissions", label: "Commissions", icon: navIcons.CreditCard },
        { href: "/demarcheur/wallet", label: "Portefeuille & retraits", icon: navIcons.Wallet },
      ],
    },
    admin: {
      title: "Back-office LocaBénin",
      nav: [
        { href: "/admin", label: "Vue d'ensemble", icon: navIcons.BarChart3 },
        { href: "/admin/annonces", label: "Modération offres", icon: navIcons.Building2 },
        { href: "/admin/utilisateurs", label: "Utilisateurs", icon: navIcons.Users },
        { href: "/admin/kyc", label: "KYC", icon: navIcons.ShieldCheck },
        { href: "/admin/paiements", label: "Paiements", icon: navIcons.CreditCard },
        { href: "/admin/retraits", label: "Retraits", icon: navIcons.Wallet },
        { href: "/admin/commissions", label: "Commissions", icon: navIcons.CreditCard },
        { href: "/admin/signalements", label: "Signalements", icon: navIcons.ShieldCheck },
        { href: "/admin/parametres", label: "Paramétrage", icon: navIcons.Settings },
        { href: "/admin/audit", label: "Journal d'audit", icon: navIcons.ScrollText },
      ],
    },
  };

  const isDashboard = p0 in dashboardRoutes;
  return (
    <div className="min-h-screen">
      {isPublicChrome ? (
        <>
          <PublicHeader />
          <main className="min-h-[70vh]">{view}</main>
          <PublicTabBar />
        </>
      ) : isDashboard ? (
        loading ? <ViewLoader /> : hasAccess ? (
          <>
            <DashboardShell title={dashboardRoutes[p0].title} nav={dashboardRoutes[p0].nav}>
              {view}
            </DashboardShell>
            <SpaceTabBar items={dashboardRoutes[p0].nav} />
          </>
        ) : (
          <RoleHome />
        )
      ) : (
        <main className="min-h-screen">{view}</main>
      )}
    </div>
  );
}
