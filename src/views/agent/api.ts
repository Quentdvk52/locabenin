"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : helpers clients partagés
// Garde de session 401 → redirection connexion + erreurs homogènes.
// ============================================================

import { apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";

export async function guardedGet<T>(url: string): Promise<T> {
  try {
    return await apiGet<T>(url);
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) {
      navigate("/connexion", { replace: true });
      toast.error("Connectez-vous pour accéder à votre espace démarcheur.");
    }
    throw e;
  }
}

export async function guardedSend<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  try {
    return await apiSend<T>(url, method, body);
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) {
      navigate("/connexion", { replace: true });
      toast.error("Connectez-vous pour continuer.");
    }
    throw e;
  }
}

export function mutationError(e: unknown, fallback = "Action impossible pour le moment."): string {
  if (e instanceof ApiClientError) {
    if (e.status === 401) {
      navigate("/connexion", { replace: true });
      return "Session expirée, reconnectez-vous.";
    }
    return e.message || fallback;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

// ---------- Formes des réponses de /api/agent ----------

export interface AgentLinkItem {
  id: string;
  code: string;
  clicks: number;
  createdAt: string;
  listingId: string;
  listing: {
    id: string;
    title: string;
    reference: string;
    rentAmount: number;
    rentPeriod: string;
    genre: string;
    status: string;
    affiliateEnabled: boolean;
    coverUrl: string | null;
  };
  commissionsCount: number;
  commissionsTotal: number;
}

export interface AgentCommissionItem {
  id: string;
  listingId: string;
  listingTitle: string;
  leaseRef: string | null;
  tenantShare: number;
  ownerShare: number;
  total: number;
  status: string;
  validatableAt: string;
  validatedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AgentStatusBucket {
  count: number;
  total: number;
}

export interface AgentData {
  links: AgentLinkItem[];
  commissions: AgentCommissionItem[];
  stats: {
    totalClicks: number;
    totalLinks: number;
    commissionsCount: number;
    commissionsTotal: number;
    pending: AgentStatusBucket;
    validated: AgentStatusBucket;
    paid: AgentStatusBucket;
    cancelled: AgentStatusBucket;
    concluded: number;
    conversionRate: number;
  };
  walletBalance: number;
  settings: {
    commissionValidationDays: number;
    commissionTenantSharePct: number;
    commissionOwnerSharePct: number;
    payoutMinAmount: number;
    payoutAutoApprovalThreshold: number;
  };
}

// ---------- Retraits (/api/payouts) ----------

export interface PayoutItem {
  id: string;
  userId: string;
  userRole: string;
  amount: number;
  method: string;
  destination: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  rejectionReason: string | null;
}

export interface PayoutData {
  ownerBalance: number;
  agentBalance: number;
  payouts: PayoutItem[];
  settings: { min: number; autoThreshold: number };
  statements: {
    OWNER: Array<{ id: string; direction: string; amount: number; memo: string; createdAt: string; paymentId: string | null; payoutId: string | null }>;
    AGENT: Array<{ id: string; direction: string; amount: number; memo: string; createdAt: string; paymentId: string | null; payoutId: string | null }>;
  };
}
