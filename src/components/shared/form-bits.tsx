"use client";

// ============================================================
// LocaBénin — Composants de formulaire métier
// • MoneyInput : montant FCFA (clavier numérique, formatage live)
// • WizardStepper : barre de progression multi-étapes
// • Timeline : chronologie de statut
// • StatusPill : pastille compacte
// ============================================================

import { useMemo } from "react";
import { formatFcfa } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function MoneyInput({
  value, onChange, placeholder = "0", className, disabled, ariaLabel,
}: {
  value: number | "";
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const display = useMemo(() => (value === "" || value == null ? "" : new Intl.NumberFormat("fr-FR").format(value)), [value]);
  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9\s]*"
        disabled={disabled}
        aria-label={ariaLabel ?? "Montant en FCFA"}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 12);
          onChange(digits === "" ? 0 : parseInt(digits, 10));
        }}
        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 pr-12 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">FCFA</span>
    </div>
  );
}

export function WizardStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Étapes du formulaire">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold",
                done && "bg-primary/15 text-primary",
                active && "bg-primary text-primary-foreground shadow-soft",
                !done && !active && "bg-secondary text-muted-foreground",
              )}
            >
              <span className={cn("grid size-5 place-items-center rounded-full text-[10px]", done ? "bg-primary text-primary-foreground" : active ? "bg-primary-foreground/20" : "bg-muted")}>
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{s}</span>
            </span>
            {i < steps.length - 1 && <span className={cn("h-0.5 min-w-2 flex-1 rounded", done ? "bg-primary/40" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ items }: { items: Array<{ title: string; description?: string; time?: string; state: "done" | "current" | "pending" }> }) {
  return (
    <ol className="relative space-y-0 border-l-2 border-border pl-5">
      {items.map((item, i) => (
        <li key={i} className="relative pb-6 last:pb-0">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[27px] grid size-4 place-items-center rounded-full border-2",
              item.state === "done" && "border-primary bg-primary",
              item.state === "current" && "border-primary bg-background ring-4 ring-primary/20",
              item.state === "pending" && "border-border bg-background",
            )}
          />
          <p className={cn("text-sm font-semibold", item.state === "pending" && "text-muted-foreground")}>{item.title}</p>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
          {item.time && <p className="mt-0.5 text-xs text-muted-foreground">{item.time}</p>}
        </li>
      ))}
    </ol>
  );
}

export function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm text-right", strong ? "font-bold font-display" : "font-medium")}>{value}</span>
    </div>
  );
}
