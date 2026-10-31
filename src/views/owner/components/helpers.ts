"use client";

// ============================================================
// LocaBénin — Helpers locaux de l'espace propriétaire
// Gestion d'erreurs API (401 → connexion), initiales, libellés.
// ============================================================

import { toast } from "sonner";
import { ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";

/** Toast d'erreur standard : 401 → redirection connexion, sinon message API. */
export function handleApiError(e: unknown, fallback = "Une erreur est survenue."): void {
  if (e instanceof ApiClientError) {
    if (e.status === 401) {
      toast.error("Session expirée, connectez-vous à nouveau.");
      navigate("/connexion");
      return;
    }
    toast.error(e.message || fallback);
    return;
  }
  toast.error(fallback);
}

/** Initiales pour avatars : « Aline Kponou » → « AK ». */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function formatDateFr(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** Date d'entrée pour <input type="date"> (AAAA-MM-JJ). */
export function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
