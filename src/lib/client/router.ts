"use client";
// ============================================================
// LocaBénin — Routeur applicatif (hash)
// L'application est servie sur la route unique « / » (contrainte du
// bac à sable de prévisualisation). Ce routeur hash (#/chemin) donne
// des URLs partageables + boutons retour, avec chargement paresseux
// des vues. Migration production : remplacer par les routes App Router
// natives (src/views/* → src/app/*/page.tsx), voir docs/ROUTES.md.
// ============================================================

import { useCallback, useEffect, useState } from "react";

export interface RouteInfo {
  path: string;          // ex. "/proprietaire/biens"
  segments: string[];    // ex. ["proprietaire", "biens"]
  query: Record<string, string>;
  raw: string;
}

function parseHash(): RouteInfo {
  const raw = typeof window === "undefined" ? "#/" : window.location.hash || "#/";
  let h = raw.slice(1);
  if (!h.startsWith("/")) h = "/" + h;
  const [pathPart, queryPart] = h.split("?");
  const query: Record<string, string> = {};
  if (queryPart) {
    for (const [k, v] of new URLSearchParams(queryPart).entries()) query[k] = v;
  }
  const path = pathPart.length > 1 ? pathPart.replace(/\/+$/, "") : "/";
  return { path, segments: path.split("/").filter(Boolean), query, raw };
}

export function useRoute(): RouteInfo {
  const [route, setRoute] = useState<RouteInfo>(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string, opts?: { replace?: boolean; keepScroll?: boolean }) {
  const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : "/" + path}`;
  if (opts?.replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target.slice(1);
  }
  if (!opts?.keepScroll) requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

export function useNavigate() {
  return useCallback((path: string, opts?: { replace?: boolean; keepScroll?: boolean }) => navigate(path, opts), []);
}

/** Construit une URL de recherche avec filtres partageables (dans l'URL). */
export function buildSearchUrl(filters: Record<string, string | number | undefined | null>, base = "/recherche"): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
