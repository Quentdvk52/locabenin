"use client";

// ============================================================
// LocaBénin — Composants locaux du back-office admin
// (complète les composants partagés sans les modifier)
// ============================================================

import type { ReactNode } from "react";
import { ApiClientError } from "@/lib/client/session";
import { ErrorState } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

/** Message d'erreur lisible pour les requêtes admin (401/403 dédiés). */
export function adminError(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.status === 401 || e.status === 403) return "Accès réservé à l'administration.";
    return e.message;
  }
  return "Une erreur est survenue. Réessayez.";
}

export function AdminError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiClientError ? error : null;
  const isGuard = e?.status === 401 || e?.status === 403;
  return (
    <ErrorState
      message={adminError(error)}
      onRetry={isGuard ? undefined : onRetry}
      className={isGuard ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5" : undefined}
    />
  );
}

/** En-tête de page admin : titre, description, actions à droite. */
export function PageIntro({
  title, description, actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight lg:text-2xl">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Carte de section réutilisable. */
export function SectionCard({
  title, description, actions, children, className, contentClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-soft", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <div>
            {title && <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", contentClassName)}>{children}</div>
    </section>
  );
}

/** Bandeau d'alerte d'action admin (file non vide → onglet). */
export function ActionBanner({
  icon, title, description, count, onClick, tone = "amber",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  count: number;
  onClick: () => void;
  tone?: "amber" | "red";
}) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-soft transition-colors hover:bg-accent/40",
        tone === "amber" ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-red-300 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-red-500/15 text-red-700 dark:text-red-400")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
      </span>
      <span className={cn("grid size-8 place-items-center rounded-full text-sm font-bold", tone === "amber" ? "bg-amber-500 text-amber-950" : "bg-red-600 text-white")}>
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}

/** Carte « Intégrité du ledger » (vue d'ensemble). */
export function LedgerBadge({ balanced }: { balanced: boolean }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
        balanced ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
      )}
    >
      {balanced ? "Équilibré" : "Déséquilibre"}
    </span>
  );
}

export function GuardNote() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span>Accès réservé à l&apos;administration.</span>
    </div>
  );
}

/** Initiales d'un nom complet (avatars). */
export function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
