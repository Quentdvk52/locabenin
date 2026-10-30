"use client";

// ============================================================
// LocaBénin — Badges de statut et de vérification
// ============================================================

import { Badge } from "@/components/ui/badge";
import { BadgeCheck, ShieldCheck, Crown } from "lucide-react";
import { label } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  RESERVED: "bg-amber-100 text-amber-800 border-amber-200",
  RENTED: "bg-stone-200 text-stone-700 border-stone-300",
  PENDING_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  DRAFT: "bg-muted text-muted-foreground",
  SUSPENDED_OWNER: "bg-red-100 text-red-700 border-red-200",
  SUSPENDED_UNPAID: "bg-red-100 text-red-700 border-red-200",
  ARCHIVED: "bg-muted text-muted-foreground",
  PAID: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-800",
  PARTIAL: "bg-orange-100 text-orange-800",
  LATE: "bg-red-100 text-red-700",
  WAIVED: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  NOTICE_GIVEN: "bg-amber-100 text-amber-800",
  TERMINATED: "bg-stone-200 text-stone-700",
  EXPIRED: "bg-stone-200 text-stone-700",
  SUCCESS: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
  REFUNDED: "bg-violet-100 text-violet-800",
  DISPUTED: "bg-orange-100 text-orange-800",
  INITIATED: "bg-muted text-muted-foreground",
  REQUESTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-muted text-muted-foreground",
  DONE: "bg-emerald-100 text-emerald-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  WITHDRAWN: "bg-muted text-muted-foreground",
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-stone-200 text-stone-700",
  PENDING_VALIDATION: "bg-amber-100 text-amber-800",
  VALIDATED: "bg-emerald-100 text-emerald-800",
  DUE: "bg-amber-100 text-amber-800",
  OVERDUE: "bg-red-100 text-red-700",
  OTP_PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  PROCESSING: "bg-sky-100 text-sky-800",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  NONE: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium border", STATUS_VARIANT[status] ?? "bg-muted text-muted-foreground", className)}>
      {label(status)}
    </Badge>
  );
}

export function GenreBadge({ genre, className }: { genre: string; className?: string }) {
  const isFurnished = genre === "FURNISHED";
  return (
    <Badge className={cn("font-semibold border-0", isFurnished ? "bg-amber-500/95 text-amber-950" : "bg-emerald-700/95 text-white", className)}>
      {isFurnished ? "Meublé" : "Location simple"}
    </Badge>
  );
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("bg-white/90 backdrop-blur border-border font-medium", className)}>
      {label(type)}
    </Badge>
  );
}

export function AgentBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("bg-violet-600/95 text-white border-0 font-semibold", className)}>
      <Crown className="size-3 mr-1" /> Démarcheur
    </Badge>
  );
}

export function VerifiedBadge({ status, showText = true, className }: { status: string; showText?: boolean; className?: string }) {
  if (status !== "VERIFIED") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400", className)}>
      <BadgeCheck className="size-4" aria-hidden />
      {showText ? "Vérifié" : null}
    </span>
  );
}

export function KycBadge({ status, className }: { status: string; className?: string }) {
  if (status === "VERIFIED") {
    return (
      <Badge className={cn("bg-emerald-100 text-emerald-800 border-emerald-200 gap-1", className)}>
        <ShieldCheck className="size-3" /> Identité vérifiée
      </Badge>
    );
  }
  if (status === "PENDING") {
    return <Badge className={cn("bg-amber-100 text-amber-800 border-amber-200", className)}>Vérification en cours</Badge>;
  }
  return <Badge variant="outline" className={cn("text-muted-foreground", className)}>Non vérifié</Badge>;
}
