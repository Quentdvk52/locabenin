"use client";

// ============================================================
// LocaBénin — Espace Locataire : helpers clients partagés
// Garde de session 401 → redirection connexion, mapping des cartes.
// ============================================================

import { apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import type { ListingCardData } from "@/components/shared/listing-card";

/** GET avec garde de session : 401 → retour à la connexion. */
export async function guardedGet<T>(url: string): Promise<T> {
  try {
    return await apiGet<T>(url);
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) {
      navigate("/connexion", { replace: true });
      toast.error("Connectez-vous pour accéder à votre espace.");
    }
    throw e;
  }
}

/** POST/PUT/PATCH/DELETE avec garde de session. */
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

/** Gestion d'erreur homogène pour les mutations (toasts). */
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

/** Compression client (WebP, max 1200px) avant upload — économise la data mobile. */
export async function compressImage(file: File, maxSize = 1200): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

/** Upload d'une photo (compressée) → URL publique. */
export async function uploadPhoto(file: File): Promise<string> {
  const dataUrl = await compressImage(file);
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.set("file", new File([blob], "photo.webp", { type: "image/webp" }));
  form.set("kind", "IMAGE");
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const json = (await res.json()) as { ok: boolean; data?: { url: string }; error?: string };
  if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "Upload impossible");
  return json.data.url;
}

// ---------- Formes brutes des réponses API (typage strict sans any) ----------

export interface RawArea {
  name: string | null;
  commune?: { name: string | null } | null;
}

export interface RawListingMedia {
  url: string;
  thumbUrl?: string | null;
}

/** Offre brute renvoyée par les API (favoris, détail bail, catalogue). */
export interface RawListing {
  id: string;
  reference: string;
  title: string;
  type: string;
  genre: string;
  status: string;
  rentAmount: number;
  rentPeriod: string;
  dailyPrice: number | null;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  depositAmount: number;
  bedrooms: number;
  bathrooms: number;
  surfaceM2?: number | null;
  addressText?: string | null;
  isFeatured?: boolean;
  affiliateEnabled?: boolean;
  commissionAmount?: number | null;
  area?: RawArea | null;
  media?: RawListingMedia[];
  coverUrl?: string | null;
  photos?: RawListingMedia[];
}

/** Mappe une offre brute vers les données attendues par ListingCard. */
export function toCardData(l: RawListing): ListingCardData {
  const photos = l.photos ?? l.media ?? [];
  return {
    id: l.id,
    reference: l.reference,
    title: l.title,
    type: l.type,
    genre: l.genre,
    status: l.status,
    rentAmount: l.rentAmount,
    rentPeriod: l.rentPeriod,
    dailyPrice: l.dailyPrice,
    weeklyPrice: l.weeklyPrice,
    monthlyPrice: l.monthlyPrice,
    depositAmount: l.depositAmount,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    surfaceM2: l.surfaceM2 ?? null,
    areaName: l.area?.name ?? null,
    communeName: l.area?.commune?.name ?? null,
    isFeatured: l.isFeatured,
    affiliateEnabled: l.affiliateEnabled,
    coverUrl: l.coverUrl ?? photos[0]?.url ?? null,
    photos,
  };
}

// ---------- Paiements ----------

export interface PaymentHistoryItem {
  id: string;
  reference: string;
  purpose: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  breakdownJson: string | null;
  leaseRef: string | null;
  bookingRef: string | null;
  label: string;
  quittanceUrl: string | null;
  receiptUrl: string | null;
}

/** Intention de paiement renvoyée par l'appelant via makePayment(). */
export interface PaymentIntent {
  reference: string;
  mockConfirmToken?: string;
  amount: number;
  breakdown?: Array<{ label: string; amount: number }>;
}

// ---------- Baux & échéanciers ----------

export interface RawSchedule {
  id: string;
  leaseId: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  paidAt: string | null;
  paymentId: string | null;
  quittanceUrl: string | null;
}

export interface RawLeasePerson {
  id: string;
  fullName: string;
  phone: string;
  kycStatus: string;
}

/** Bail renvoyé par GET /api/leases (liste) ou GET /api/leases/:id (détail). */
export interface RawLease {
  id: string;
  reference: string;
  listingId: string;
  ownerId: string;
  tenantId: string;
  kind: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  advanceMonths: number;
  advancePaidAmount: number;
  depositOptionsJson?: string | null;
  commissionTotal: number;
  commissionTenantShare: number;
  commissionOwnerShare: number;
  allowPartial: boolean;
  contractPdfUrl: string | null;
  contractHash: string | null;
  ownerSignatureUrl: string | null;
  ownerSignedAt: string | null;
  tenantSignatureUrl: string | null;
  tenantSignedAt: string | null;
  noticeDate: string | null;
  listing: RawListing & { description?: string; rulesText?: string | null };
  owner: RawLeasePerson;
  tenant: RawLeasePerson;
  schedules: RawSchedule[];
}

/** Choisit le bail « courant » : actif d'abord, sinon le plus récent. */
export function pickCurrentLease(leases: RawLease[]): RawLease | null {
  if (leases.length === 0) return null;
  const active = leases.find((l) => l.status === "ACTIVE") ?? leases.find((l) => l.status === "NOTICE_GIVEN");
  return active ?? leases[0];
}

/** Parse le snapshot des cautions optionnelles d'un bail. */
export function parseDepositOptions(json: string | null | undefined): Array<{ label: string; amount: number }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ label: string; amount: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Jours restants avant une échéance (arrondi au jour). */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);
}
