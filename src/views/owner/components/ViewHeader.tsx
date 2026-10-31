"use client";

// ============================================================
// LocaBénin — En-tête de page interne (titre + action principale)
// ============================================================

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ViewHeader({
  title, subtitle, icon: Icon, action,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5.5" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
