// ============================================================
// LocaBénin — Rate limiting mémoire (fenêtre glissante simple)
// Production : remplacer par un limiteur distribué (Upstash/Supabase Edge).
// Clé typique : `${bucket}:${identifier}`.
// ============================================================

const buckets = new Map<string, number[]>();

/**
 * Autorise `limit` requêtes par fenêtre de `windowMs` pour une clé.
 * Retourne true si autorisé, false si dépassé.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // Nettoyage opportuniste pour éviter la croissance illimitée
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export const RATE_LIMITS = {
  otpSend: { limit: 3, windowMs: 10 * 60_000 },
  otpVerify: { limit: 10, windowMs: 10 * 60_000 },
  login: { limit: 10, windowMs: 10 * 60_000 },
  search: { limit: 120, windowMs: 60_000 },
  message: { limit: 30, windowMs: 60_000 },
  payment: { limit: 10, windowMs: 60_000 },
  upload: { limit: 40, windowMs: 60_000 },
} as const;
