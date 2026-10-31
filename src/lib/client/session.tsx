"use client";
// ============================================================
// LocaBénin — Client API + contexte de session
// Enveloppe d'appel cohérente avec l'API serveur ({ok, data} / {ok, error}).
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role } from "@/lib/constants";

export interface SessionUserClient {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  whatsapp: string | null;
  kycStatus: string;
  roles: Role[];
  activeRole: Role;
  isAdmin: boolean;
}

export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({ ok: false, error: "Réponse illisible" }));
  if (!res.ok || !json.ok) throw new ApiClientError(res.status, json.error ?? "Erreur inconnue");
  return json.data as T;
}

export async function apiSend<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "Réponse illisible" }));
  if (!res.ok || !json.ok) throw new ApiClientError(res.status, json.error ?? "Erreur inconnue");
  return json.data as T;
}

interface SessionContextValue {
  user: SessionUserClient | null;
  loading: boolean;
  refresh: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null, loading: true, refresh: async () => {}, switchRole: async () => {}, logout: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserClient | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<SessionUserClient | null>("/api/me/session");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const switchRole = useCallback(async (role: Role) => {
    await apiSend("/api/me/switch-role", "POST", { role });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiSend("/api/auth/logout", "POST");
    setUser(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh, switchRole, logout }), [user, loading, refresh, switchRole, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
