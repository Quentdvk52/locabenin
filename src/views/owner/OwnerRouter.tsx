"use client";

// ============================================================
// LocaBénin — Routeur de l'espace propriétaire
// Reçoit la route hash (ex. /proprietaire/biens/nouveau) et rend
// la vue correspondante. Le chrome (DashboardShell) est géré par
// la coquille : ici on ne rend que le contenu.
// ============================================================

import { useEffect } from "react";
import { navigate } from "@/lib/client/router";
import { EmptyState } from "@/components/shared/states";
import OwnerDashboard from "./OwnerDashboard";
import OwnerListings from "./OwnerListings";
import ListingWizard from "./ListingWizard";
import OwnerTenants from "./OwnerTenants";
import OwnerFinance from "./OwnerFinance";
import OwnerSubscription from "./OwnerSubscription";
import OwnerVisits from "./OwnerVisits";
import OwnerTickets from "./OwnerTickets";
import OwnerAnnouncements from "./OwnerAnnouncements";
import OwnerKyc from "./OwnerKyc";

/** La messagerie est transverse : redirection vers la vue dédiée. */
function MessagingRedirect() {
  useEffect(() => {
    navigate("/messagerie", { replace: true });
  }, []);
  return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Ouverture de la messagerie…
    </div>
  );
}

export default function OwnerRouter({ route }: { route: string }) {
  const path = route.replace(/\/+$/, "") || "/proprietaire";
  const seg = path.split("/").filter(Boolean);
  // seg[0] === "proprietaire" ; s1 = sous-section, s2 = id ou action
  const s1 = seg[1] ?? "";
  const s2 = seg[2] ?? "";

  if (s1 === "" || s1 === "tableau-de-bord") return <OwnerDashboard />;
  if (s1 === "messages") return <MessagingRedirect />;
  if (s1 === "biens") {
    if (s2 === "nouveau") return <ListingWizard />;
    if (s2) return <ListingWizard listingId={s2} />;
    return <OwnerListings />;
  }
  if (s1 === "locataires") return <OwnerTenants />;
  if (s1 === "finances") return <OwnerFinance />;
  if (s1 === "abonnement") return <OwnerSubscription />;
  if (s1 === "visites") return <OwnerVisits />;
  if (s1 === "reparations") return <OwnerTickets />;
  if (s1 === "annonces") return <OwnerAnnouncements />;
  if (s1 === "kyc") return <OwnerKyc />;

  return (
    <EmptyState
      title="Page introuvable"
      description="Le lien suivi n'existe pas dans l'espace propriétaire."
      actionLabel="Retour au tableau de bord"
      onAction={() => navigate("/proprietaire")}
    />
  );
}
