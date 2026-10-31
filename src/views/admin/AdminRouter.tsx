"use client";

// ============================================================
// LocaBénin — AdminRouter : répartiteur des vues back-office
// Reçoit { route } (ex. "/admin", "/admin/annonces"…) de la coquille.
// Le chrome (DashboardShell) est géré par src/app/page.tsx.
// ============================================================

import type { ComponentType } from "react";
import AdminOverview from "./AdminOverview";
import AdminModeration from "./AdminModeration";
import AdminUsers from "./AdminUsers";
import AdminKyc from "./AdminKyc";
import AdminPayments from "./AdminPayments";
import AdminPayouts from "./AdminPayouts";
import AdminCommissions from "./AdminCommissions";
import AdminReports from "./AdminReports";
import AdminSettings from "./AdminSettings";
import AdminAudit from "./AdminAudit";

const ROUTES: Record<string, ComponentType> = {
  "/admin": AdminOverview,
  "/admin/annonces": AdminModeration,
  "/admin/utilisateurs": AdminUsers,
  "/admin/kyc": AdminKyc,
  "/admin/paiements": AdminPayments,
  "/admin/retraits": AdminPayouts,
  "/admin/commissions": AdminCommissions,
  "/admin/signalements": AdminReports,
  "/admin/parametres": AdminSettings,
  "/admin/audit": AdminAudit,
};

export default function AdminRouter({ route }: { route: string }) {
  const base = route.split("?")[0].replace(/\/+$/, "") || "/admin";
  const View = ROUTES[base] ?? AdminOverview;
  return (
    <div className="mx-auto max-w-7xl">
      <View />
    </div>
  );
}
