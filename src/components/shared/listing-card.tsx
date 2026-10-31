"use client";

// ============================================================
// LocaBénin — Carte d'offre premium
// Carrousel photos tactile, badges, prix mis en avant, favori animé,
// caractéristiques. Utilisée sur le fil infini, la recherche et les
// listes internes.
// ============================================================

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { BedDouble, Bath, Ruler, Heart, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GenreBadge, TypeBadge, AgentBadge } from "./badges";
import { formatPricePeriod, formatFcfa } from "@/lib/finance";
import { label } from "@/lib/constants";
import { apiSend } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ListingCardData {
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
  surfaceM2: number | null;
  areaName: string | null;
  communeName: string | null;
  isFeatured?: boolean;
  affiliateEnabled?: boolean;
  coverUrl: string | null;
  photos: Array<{ url: string; thumbUrl?: string | null }>;
  isFavorite?: boolean;
  commissionAmount?: number | null;
}

export function displayPrice(l: Pick<ListingCardData, "genre" | "rentAmount" | "rentPeriod" | "dailyPrice" | "weeklyPrice" | "monthlyPrice">): string {
  if (l.genre === "FURNISHED") {
    const parts: string[] = [];
    if (l.dailyPrice) parts.push(`${formatFcfa(l.dailyPrice)} / jour`);
    if (l.weeklyPrice) parts.push(`${formatFcfa(l.weeklyPrice)} / semaine`);
    if (l.monthlyPrice) parts.push(`${formatFcfa(l.monthlyPrice)} / mois`);
    return parts.join(" · ") || "Prix sur demande";
  }
  return formatPricePeriod(l.rentAmount, l.rentPeriod);
}

export function ListingCard({
  listing,
  onFavoriteToggle,
  className,
  showAgentBadge,
}: {
  listing: ListingCardData;
  onFavoriteToggle?: (id: string, next: boolean) => void;
  className?: string;
  showAgentBadge?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [fav, setFav] = useState(Boolean(listing.isFavorite));
  const [pendingFav, setPendingFav] = useState(false);
  const photos = listing.photos?.length ? listing.photos : listing.coverUrl ? [{ url: listing.coverUrl }] : [];
  const count = photos.length;

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pendingFav) return;
    setPendingFav(true);
    const next = !fav;
    setFav(next);
    try {
      await apiSend("/api/me/favorites", "POST", { listingId: listing.id });
      onFavoriteToggle?.(listing.id, next);
    } catch (err) {
      setFav(!next);
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setPendingFav(false);
    }
  }

  function prev(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setIndex((i) => (i - 1 + count) % count);
  }
  function next(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setIndex((i) => (i + 1) % count);
  }

  const open = () => navigate(`/offres/${listing.id}?ref=`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "40px" }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow duration-200 hover:shadow-lift cursor-pointer",
        className,
      )}
      onClick={open}
      role="link"
      aria-label={`Voir l'offre ${listing.title}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}
    >
      {/* Médias */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
        {photos.length > 0 ? (
          <Image
            src={photos[index]?.url}
            alt={`${listing.title} — photo ${index + 1}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            priority={index === 0 && listing.isFeatured === true}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Images className="size-10" aria-hidden />
          </div>
        )}

        {/* Bandeau de badges */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 max-w-[85%]">
          <GenreBadge genre={listing.genre} />
          {listing.type !== "APARTMENT" && <TypeBadge type={listing.type} />}
          {showAgentBadge && listing.affiliateEnabled && <AgentBadge />}
          {listing.isFeatured && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow">À la une</span>
          )}
        </div>

        {/* Favori */}
        <button
          onClick={toggleFavorite}
          aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={fav}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/90 shadow backdrop-blur transition-transform active:scale-90 dark:bg-black/60"
        >
          <motion.span animate={fav ? { scale: [1, 1.3, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
            <Heart className={cn("size-4.5", fav ? "fill-red-500 text-red-500" : "text-stone-600 dark:text-stone-300")} />
          </motion.span>
        </button>

        {/* Carrousel */}
        {count > 1 && (
          <>
            <button onClick={prev} aria-label="Photo précédente"
              className="absolute left-2 top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow opacity-0 transition-opacity group-hover:opacity-100 sm:grid">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={next} aria-label="Photo suivante"
              className="absolute right-2 top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow opacity-0 transition-opacity group-hover:opacity-100 sm:grid">
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.slice(0, 6).map((_, i) => (
                <span key={i} aria-hidden className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-white" : "w-1.5 bg-white/60")} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Contenu */}
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-display text-[15px] font-semibold">{listing.title}</h3>
        </div>
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {listing.areaName ? `${listing.areaName}, ` : ""}{listing.communeName ?? "Bénin"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {listing.bedrooms >= 0 && <span className="inline-flex items-center gap-1"><BedDouble className="size-3.5" aria-hidden />{listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} ch.`}</span>}
          {listing.bathrooms > 0 && <span className="inline-flex items-center gap-1"><Bath className="size-3.5" aria-hidden />{listing.bathrooms} douches</span>}
          {listing.surfaceM2 ? <span className="inline-flex items-center gap-1"><Ruler className="size-3.5" aria-hidden />{listing.surfaceM2} m²</span> : null}
        </div>
        <div className="flex items-end justify-between pt-1">
          <p className="font-display text-base font-bold text-primary">{displayPrice(listing)}</p>
          {listing.status !== "PUBLISHED" && (
            <span className="text-xs font-semibold text-muted-foreground">{label(listing.status)}</span>
          )}
        </div>
        {showAgentBadge && listing.affiliateEnabled && listing.commissionAmount != null && (
          <p className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            Commission estimée : {formatFcfa(listing.commissionAmount)}
          </p>
        )}
      </div>
    </motion.article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}
