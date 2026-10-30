"use client";

// ============================================================
// LocaBénin — États UI réutilisables : KPI, vide, erreur, skeletons
// ============================================================

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LucideIcon, TrendingUp, TrendingDown, Inbox, AlertTriangle } from "lucide-react";
import { navigate } from "@/lib/client/router";

export function KpiCard({
  title, value, sub, icon: Icon, trend, className,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  trend?: number; // pourcentage
  className?: string;
}) {
  const TrendIcon = trend != null && trend >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {trend != null && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", trend >= 0 ? "text-emerald-600" : "text-red-600")}>
            <TrendIcon className="size-3" /> {Math.abs(trend)} %
          </span>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title, description, icon: Icon = Inbox, actionLabel, actionHref, onAction, className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actionLabel && (actionHref || onAction) && (
        <Button className="mt-5" onClick={() => (actionHref ? navigate(actionHref) : onAction?.())}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-base font-semibold">Une erreur est survenue</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}

export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}
