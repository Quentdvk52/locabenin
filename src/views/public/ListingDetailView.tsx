"use client";

// ============================================================
// LocaBénin — Fiche d'offre publique
// Galerie plein écran, badges, prix, calculateur « coût total à
// l'entrée », carte approximative, profil propriétaire, actions
// (favori, visite, candidature, partage, signalement), réservation
// de meublé avec paiement Mobile Money, avis, offres similaires.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Images, MapPin, Eye, BedDouble, Bath, Ruler,
  Wind, Wifi, Car, ShieldCheck, Droplets, Zap, Waves, Plug, Cylinder,
  Building2, Fence, Flower2, Sofa, Flame, AirVent, DoorClosed, Cctv,
  Trash2, SprayCan, MoveVertical, CircleHelp, Star, Heart, Share2,
  CalendarDays, FileText, Flag, MessageCircle, Loader2, CheckCircle2,
  Info, Wallet, Ban,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ListingCard, type ListingCardData } from "@/components/shared/listing-card";
import { GenreBadge, TypeBadge, StatusBadge, AgentBadge, VerifiedBadge } from "@/components/shared/badges";
import { ErrorState } from "@/components/shared/states";
import { formatFcfa, formatPricePeriod, formatDate } from "@/lib/finance";
import { bookingTotal } from "@/lib/finance";
import { label, REPORT_REASONS } from "@/lib/constants";
import { apiGet, apiSend, ApiClientError, useSession } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PaymentDialog } from "./components/PaymentDialog";

const MiniMap = dynamic(() => import("./components/MiniMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-xl" />,
});

// ---------- Types de l'API /api/public/listings/:id ----------

interface DetailListing {
  id: string;
  reference: string;
  title: string;
  description: string;
  type: string;
  genre: string;
  status: string;
  bedrooms: number;
  bathrooms: number;
  livingRooms: number;
  surfaceM2: number | null;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  advanceMonths: number;
  dailyPrice: number | null;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  minStayDays: number | null;
  allowPartial: boolean;
  rulesText: string | null;
  affiliateEnabled: boolean;
  addressText: string | null;
  area: { id: string; name: string } | null;
  commune: { id: string; name: string } | null;
  department: { code: string; name: string } | null;
  latitude: number | null;
  longitude: number | null;
  media: Array<{ id: string; url: string; kind: string; isCover: boolean }>;
  amenities: Array<{ code: string; label: string; icon: string; group: string }>;
  depositOptions: Array<{ label: string; amount: number }>;
  visitsCount: number;
  publishedAt: string | null;
  calendarBlocks: Array<{ startDate: string; endDate: string; reason: string | null }>;
  reviews: Array<{ id: string; rating: number; comment: string | null; author: string; createdAt: string }>;
}

interface DetailOwner {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  kycStatus: string;
  memberSince: string;
  phone: string | null;
  whatsapp: string | null;
}

interface DetailData {
  listing: DetailListing;
  owner: DetailOwner;
  entryCost: { lines: Array<{ label: string; amount: number }>; total: number; note: string } | null;
  commission: { tenantShare: number; ownerShare: number } | null;
  attributed: boolean;
  attributedNow: boolean;
  isFavorite: boolean;
  similar: ListingCardData[];
  viewerIsOwner: boolean;
}

interface BookingCalendar {
  bookings: Array<{ startDate: string; endDate: string; status: string }>;
  blocks: Array<{ startDate: string; endDate: string; reason: string | null }>;
}

const AMENITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CLIM: Wind, WIFI: Wifi, PARKING: Car, GUARD: ShieldCheck, WATER: Droplets,
  POWER: Zap, BOREHOLE: Waves, GENERATOR: Plug, TANK: Cylinder, BALCONY: Building2,
  YARD: Fence, GARDEN: Flower2, FURNITURE: Sofa, HOTWATER: Flame,
  AC_UNIT_EACH: AirVent, SECURITY_DOOR: DoorClosed, CCTV: Cctv, TRASH: Trash2,
  MAID: SprayCan, ELEVATOR: MoveVertical,
};

const DEFAULT_TITLE = "LocaBénin — Location immobilière au Bénin : maisons, appartements meublés, bureaux";
const COMMISSION_LINE_PREFIX = "Frais de démarcheur";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// ============================================================

export default function ListingDetailView({ listingId }: { listingId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => apiGet<DetailData>(`/api/public/listings/${listingId}`),
    retry: 1,
  });

  const [fav, setFav] = useState<boolean | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [visitOpen, setVisitOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingAmount, setBookingAmount] = useState(0);

  const listing = data?.listing;
  const isFav = fav ?? data?.isFavorite ?? false;

  // SEO : titre dynamique
  useEffect(() => {
    if (listing) {
      document.title = `${listing.title} — ${listing.commune?.name ?? "Bénin"} | LocaBénin`;
    }
    return () => { document.title = DEFAULT_TITLE; };
  }, [listing]);

  function requireLogin(): boolean {
    if (user) return true;
    toast.info("Connectez-vous pour continuer.");
    navigate("/connexion");
    return false;
  }

  async function toggleFavorite() {
    if (!requireLogin()) return;
    const next = !isFav;
    setFav(next);
    try {
      await apiSend("/api/me/favorites", "POST", { listingId });
    } catch (e) {
      setFav(!next);
      if (e instanceof ApiClientError && e.status === 401) navigate("/connexion");
      else toast.error(e instanceof ApiClientError ? e.message : "Action impossible");
    }
  }

  async function shareListing() {
    if (!listing) return;
    const url = `${window.location.origin}/#/offres/${listing.id}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: listing.title, text: `À louer : ${listing.title}`, url });
        return;
      } catch {
        return; // partage annulé par l'utilisateur
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié dans le presse-papiers");
    } catch {
      toast.error("Copie du lien impossible");
    }
  }

  async function contactOwner() {
    if (!data || !listing) return;
    if (!requireLogin()) return;
    try {
      const r = await apiSend<{ conversationId: string }>("/api/conversations", "POST", {
        listingId: listing.id,
        recipientId: data.owner.id,
        message: `Bonjour, je suis intéressé(e) par « ${listing.title} » (réf. ${listing.reference}). Le logement est-il toujours disponible ?`,
      });
      navigate(`/messagerie?c=${r.conversationId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) navigate("/connexion");
      else toast.error(e instanceof ApiClientError ? e.message : "Message non envoyé.");
    }
  }

  function openBooking() {
    if (!requireLogin()) return;
    setBookingOpen(true);
  }

  // ----- États de chargement / erreur -----
  if (isLoading) return <DetailSkeleton />;
  if (isError || !data || !listing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState
          message={error instanceof ApiClientError ? error.message : "Cette offre n'existe pas ou a été retirée."}
          onRetry={() => void refetch()}
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => navigate("/recherche")}>Retour à la recherche</Button>
        </div>
      </div>
    );
  }

  const photos = listing.media.filter((m) => m.kind !== "VIDEO");
  const commissionLine = data.commission ? { label: `${COMMISSION_LINE_PREFIX} : 25 % d'un mois de loyer`, amount: data.commission.tenantShare } : null;
  const costLines = (data.entryCost?.lines ?? []).filter((l) => !l.label.startsWith(COMMISSION_LINE_PREFIX));
  const isAvailable = listing.status === "PUBLISHED";

  const offerJsonLd = {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: listing.title,
    description: listing.description.slice(0, 200),
    price: listing.genre === "FURNISHED" ? (listing.dailyPrice ?? listing.monthlyPrice ?? listing.rentAmount) : listing.rentAmount,
    priceCurrency: "XOF",
    areaServed: listing.commune?.name ?? "Bénin",
    availability: isAvailable ? "https://schema.org/InStock" : listing.status === "RESERVED" ? "https://schema.org/LimitedAvailability" : "https://schema.org/SoldOut",
    seller: { "@type": "Person", name: data.owner.fullName },
  };

  return (
    <div className="pb-40 md:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(offerJsonLd) }} />

      <div className="mx-auto max-w-7xl px-4 pt-4">
        <button onClick={() => navigate("/recherche")} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Retour aux résultats
        </button>

        <Gallery media={photos} title={listing.title} index={galleryIndex} onIndexChange={setGalleryIndex} onOpen={() => { setGalleryIndex(0); setGalleryOpen(true); }} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ================= COLONNE PRINCIPALE ================= */}
          <div className="min-w-0 space-y-6">
            {/* En-tête */}
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <GenreBadge genre={listing.genre} />
                <TypeBadge type={listing.type} />
                {listing.status !== "PUBLISHED" && <StatusBadge status={listing.status} />}
                {listing.affiliateEnabled && <AgentBadge />}
              </div>
              <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{listing.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4" aria-hidden />
                  {listing.area ? `${listing.area.name}, ` : ""}{listing.commune?.name ?? "Bénin"}{listing.department ? ` (${listing.department.name})` : ""}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-4" aria-hidden /> {listing.visitsCount} vue{listing.visitsCount > 1 ? "s" : ""}
                </span>
                <span>Réf. {listing.reference}</span>
                {listing.publishedAt && <span>Publiée le {formatDate(listing.publishedAt)}</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><BedDouble className="size-4" aria-hidden />{listing.bedrooms === 0 ? "Studio" : listing.bedrooms === -1 ? "Chambre-salon" : `${listing.bedrooms} chambres`}</span>
                {listing.bathrooms > 0 && <span className="inline-flex items-center gap-1"><Bath className="size-4" aria-hidden />{listing.bathrooms} douche{listing.bathrooms > 1 ? "s" : ""}</span>}
                {listing.livingRooms > 0 && <span className="inline-flex items-center gap-1"><Sofa className="size-4" aria-hidden />{listing.livingRooms} salon{listing.livingRooms > 1 ? "s" : ""}</span>}
                {listing.surfaceM2 != null && <span className="inline-flex items-center gap-1"><Ruler className="size-4" aria-hidden />{listing.surfaceM2} m²</span>}
              </div>
            </header>

            {/* Prix */}
            <section aria-label="Tarification" className="rounded-2xl border bg-card p-5 shadow-soft">
              {listing.genre === "FURNISHED" ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Par jour", value: listing.dailyPrice },
                      { label: "Par semaine", value: listing.weeklyPrice },
                      { label: "Par mois", value: listing.monthlyPrice },
                    ].map((t) => (
                      <div key={t.label} className="rounded-xl bg-secondary/60 p-3 text-center">
                        <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
                        <p className="mt-1 font-display text-base font-bold text-primary sm:text-lg">{t.value ? formatFcfa(t.value) : "—"}</p>
                      </div>
                    ))}
                  </div>
                  {listing.minStayDays ? (
                    <p className="mt-3 text-xs text-muted-foreground">Séjour minimum : {listing.minStayDays} nuit{listing.minStayDays > 1 ? "s" : ""}.</p>
                  ) : null}
                  {data.entryCost && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{data.entryCost.note}</p>}
                </>
              ) : (
                <div className="space-y-1.5">
                  <p className="font-display text-2xl font-extrabold text-primary sm:text-3xl">{formatPricePeriod(listing.rentAmount, listing.rentPeriod)}</p>
                  <p className="text-sm text-muted-foreground">
                    {listing.depositAmount > 0 && <span>+ caution {formatFcfa(listing.depositAmount)} </span>}
                    {listing.advanceMonths > 0 && <span>+ {listing.advanceMonths} mois d&apos;avance </span>}
                    {listing.depositAmount === 0 && listing.advanceMonths === 0 && "Sans caution ni avance "}
                    — à régler à l&apos;entrée via la plateforme.
                  </p>
                </div>
              )}
            </section>

            {/* Calculateur « coût total à l'entrée » */}
            {listing.genre === "SIMPLE" && data.entryCost && (
              <section aria-label="Coût total à l'entrée" className="rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/15">
                <div className="rounded-xl bg-primary/5 p-4">
                  <h2 className="flex items-center gap-2 font-display text-base font-bold">
                    Coût total à l&apos;entrée
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button aria-label="Explication du calcul" className="text-muted-foreground transition-colors hover:text-foreground">
                            <CircleHelp className="size-4" aria-hidden />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64 text-xs">
                          Estimation de tout ce que vous réglerez via la plateforme pour emménager. Aucun frais caché : chaque ligne est détaillée.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h2>
                  <div className="mt-3 space-y-2">
                    {costLines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{l.label}</span>
                        <span className="font-semibold">{formatFcfa(l.amount)}</span>
                      </div>
                    ))}
                    {commissionLine && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex w-full cursor-help items-center justify-between gap-3 rounded-lg bg-violet-100/80 px-3 py-2 text-sm font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                              <span className="inline-flex items-center gap-1.5">
                                <Info className="size-4 shrink-0" aria-hidden />
                                {commissionLine.label}
                              </span>
                              <span>{formatFcfa(commissionLine.amount)}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-64 text-xs">
                            Ce logement est proposé via un démarcheur partenaire agréé.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold">Total à l&apos;entrée</span>
                    <span className="font-display text-xl font-extrabold text-primary">{formatFcfa(data.entryCost.total)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.entryCost.note}</p>
                  {listing.allowPartial && <p className="mt-1 text-xs text-muted-foreground">Le propriétaire accepte un paiement partiel du premier loyer.</p>}
                </div>
              </section>
            )}

            {/* Description */}
            <section aria-label="Description">
              <h2 className="font-display text-lg font-bold">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{listing.description}</p>
            </section>

            {/* Équipements */}
            {listing.amenities.length > 0 && (
              <section aria-label="Équipements">
                <h2 className="font-display text-lg font-bold">Équipements &amp; services</h2>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {listing.amenities.map((a) => {
                    const Icon = AMENITY_ICONS[a.code] ?? CheckCircle2;
                    return (
                      <li key={a.code} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-sm">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        {a.label}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Règlement */}
            {listing.rulesText && (
              <section aria-label="Règlement intérieur">
                <h2 className="font-display text-lg font-bold">Règlement intérieur</h2>
                <p className="mt-2 whitespace-pre-line rounded-2xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground">{listing.rulesText}</p>
              </section>
            )}

            {/* Carte */}
            {listing.latitude != null && listing.longitude != null && (
              <section aria-label="Localisation">
                <h2 className="font-display text-lg font-bold">Localisation</h2>
                <p className="mb-3 mt-1 text-sm text-muted-foreground">
                  {listing.area ? `${listing.area.name}, ` : ""}{listing.commune?.name ?? "Bénin"} — la position exacte est communiquée après votre visite confirmée.
                </p>
                <MiniMap latitude={listing.latitude} longitude={listing.longitude} />
              </section>
            )}

            {/* Avis */}
            <ReviewsSection reviews={listing.reviews} />
          </div>

          {/* ================= COLONNE LATÉRALE ================= */}
          <aside className="space-y-4 self-start lg:sticky lg:top-20">
            {/* Propriétaire */}
            <div className="rounded-2xl border bg-card p-5 shadow-soft">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposé par</h2>
              <div className="mt-3 flex items-center gap-3">
                {data.owner.avatarUrl ? (
                  <Image src={data.owner.avatarUrl} alt={data.owner.fullName} width={48} height={48} className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary" aria-hidden>
                    {initials(data.owner.fullName)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {data.owner.fullName}
                    <VerifiedBadge status={data.owner.kycStatus} showText={false} />
                  </p>
                  <p className="text-xs text-muted-foreground">Membre depuis {formatDate(data.owner.memberSince)}</p>
                  <VerifiedBadge status={data.owner.kycStatus} className="mt-0.5" />
                </div>
              </div>
              {data.owner.kycStatus !== "VERIFIED" && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  L&apos;identité de ce propriétaire est en cours de vérification. Ne payez jamais en dehors de la plateforme.
                </p>
              )}
              <div className="mt-4 grid gap-2">
                <Button onClick={() => void contactOwner()}>
                  <MessageCircle className="mr-2 size-4" aria-hidden /> Contacter
                </Button>
                {data.owner.whatsapp && (
                  <Button variant="outline" asChild>
                    <a
                      href={`https://wa.me/${data.owner.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je vous contacte au sujet de « ${listing.title} » (réf. ${listing.reference}) vue sur LocaBénin.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="mr-2 size-4" aria-hidden /> WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Actions (desktop) */}
            <div className="hidden rounded-2xl border bg-card p-5 shadow-soft lg:block">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</h2>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" onClick={() => void toggleFavorite()} aria-pressed={isFav}>
                  <Heart className={cn("mr-2 size-4", isFav && "fill-red-500 text-red-500")} aria-hidden />
                  {isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                </Button>
                <Button variant="outline" onClick={() => { if (requireLogin()) setVisitOpen(true); }} disabled={!isAvailable}>
                  <CalendarDays className="mr-2 size-4" aria-hidden /> Demander une visite
                </Button>
                {listing.genre === "FURNISHED" ? (
                  <Button onClick={openBooking} disabled={!isAvailable}>
                    <Wallet className="mr-2 size-4" aria-hidden /> Réserver en ligne
                  </Button>
                ) : (
                  <Button onClick={() => { if (requireLogin()) setApplyOpen(true); }} disabled={!isAvailable}>
                    <FileText className="mr-2 size-4" aria-hidden /> Candidater
                  </Button>
                )}
                <Button variant="outline" onClick={() => void shareListing()}>
                  <Share2 className="mr-2 size-4" aria-hidden /> Partager
                </Button>
              </div>
              {!isAvailable && (
                <p className="mt-3 text-xs text-muted-foreground">Cette offre est {label(listing.status).toLowerCase()} — les actions sont désactivées.</p>
              )}
              <button
                onClick={() => { if (requireLogin()) setReportOpen(true); }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <Flag className="size-3.5" aria-hidden /> Signaler cette annonce
              </button>
            </div>

            {data.viewerIsOwner && (
              <div className="rounded-2xl border border-dashed bg-secondary/60 p-4 text-sm text-muted-foreground">
                Vous êtes le propriétaire de cette offre. Gérez-la depuis votre espace.
              </div>
            )}

            {/* Réassurance */}
            <div className="rounded-2xl border bg-primary/5 p-5 ring-1 ring-primary/15">
              <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4.5 text-primary" aria-hidden /> Paiement protégé LocaBénin</h3>
              <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>• Caution et loyers conservés en séquestre jusqu&apos;à la signature du bail.</li>
                <li>• Quittance automatique après chaque paiement Mobile Money.</li>
                <li>• Jamais de paiement en espèces en dehors de la plateforme.</li>
              </ul>
              <button onClick={() => navigate("/securite")} className="mt-3 text-xs font-semibold text-primary underline underline-offset-4">
                En savoir plus sur la sécurité
              </button>
            </div>
          </aside>
        </div>

        {/* Offres similaires */}
        {data.similar.length > 0 && (
          <section className="mt-10" aria-labelledby="similaires-title">
            <h2 id="similaires-title" className="font-display text-xl font-bold">Offres similaires</h2>
            <p className="mt-1 text-sm text-muted-foreground">D&apos;autres biens du même type dans la même commune.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.similar.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          </section>
        )}
      </div>

      {/* ================= BARRE D'ACTIONS MOBILE (au-dessus de la barre d'onglets) ================= */}
      <div className="fixed inset-x-0 z-40 border-t bg-background/95 backdrop-blur md:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]" role="toolbar" aria-label="Actions sur l'offre">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-3 py-2">
          <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={() => void toggleFavorite()} aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"} aria-pressed={isFav}>
            <Heart className={cn("size-5", isFav && "fill-red-500 text-red-500")} aria-hidden />
          </Button>
          <Button variant="outline" className="min-h-11 flex-1 px-2 text-xs" onClick={() => { if (requireLogin()) setVisitOpen(true); }} disabled={!isAvailable}>
            <CalendarDays className="mr-1 size-4 shrink-0" aria-hidden /> Visite
          </Button>
          {listing.genre === "FURNISHED" ? (
            <Button className="min-h-11 flex-1" onClick={openBooking} disabled={!isAvailable}>Réserver</Button>
          ) : (
            <Button className="min-h-11 flex-1" onClick={() => { if (requireLogin()) setApplyOpen(true); }} disabled={!isAvailable}>Candidater</Button>
          )}
          <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={() => void shareListing()} aria-label="Partager l'offre">
            <Share2 className="size-5" aria-hidden />
          </Button>
        </div>
      </div>
      {/* Signaler — accès mobile */}
      <p className="mx-auto max-w-7xl px-4 pt-3 md:hidden">
        <button onClick={() => { if (requireLogin()) setReportOpen(true); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Flag className="size-3.5" aria-hidden /> Signaler cette annonce
        </button>
      </p>

      {/* ================= DIALOGS ================= */}
      <GalleryDialog media={photos} title={listing.title} open={galleryOpen} onOpenChange={setGalleryOpen} index={galleryIndex} onIndexChange={setGalleryIndex} />
      <VisitDialog open={visitOpen} onOpenChange={setVisitOpen} listingId={listing.id} listingTitle={listing.title} />
      {listing.genre === "SIMPLE" && (
        <ApplicationDialog open={applyOpen} onOpenChange={setApplyOpen} listingId={listing.id} listingTitle={listing.title} />
      )}
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} listingId={listing.id} />
      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        listing={listing}
        onBooked={(id, amount) => { setBookingId(id); setBookingAmount(amount); setBookingOpen(false); setPaymentOpen(true); }}
      />
      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        amount={bookingAmount}
        description={`Réservation — ${listing.title}`}
        makePayment={async (method) => {
          if (!bookingId) throw new Error("Réservation introuvable.");
          const r = await apiSend<{ payment: { reference: string }; mockConfirmToken: string | null; checkoutUrl?: string | null }>("/api/payments/initiate", "POST", {
            purpose: "BOOKING", bookingId, method,
          });
          return { reference: r.payment.reference, mockConfirmToken: r.mockConfirmToken, checkoutUrl: r.checkoutUrl };
        }}
        onPaid={() => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["booking-calendar", listing.id] });
        }}
      />
    </div>
  );
}

// ============================================================
// Galerie (vignettes) + Dialog plein écran
// ============================================================

function Gallery({ media, title, index, onIndexChange, onOpen }: { media: DetailListing["media"]; title: string; index: number; onIndexChange: (i: number) => void; onOpen: () => void }) {
  const count = media.length;

  if (count === 0) {
    return (
      <div className="grid aspect-[16/9] w-full place-items-center rounded-2xl bg-secondary text-muted-foreground" role="img" aria-label="Aucune photo disponible">
        <Images className="size-12" aria-hidden />
      </div>
    );
  }

  const thumbs = media.slice(0, 5);
  return (
    <div className="space-y-2">
      <button
        onClick={onOpen}
        className="group relative block aspect-[16/9] w-full overflow-hidden rounded-2xl bg-secondary"
        aria-label={`Agrandir la photo ${index + 1} sur ${count}`}
      >
        <Image src={media[index]?.url ?? media[0].url} alt={`${title} — photo ${index + 1}`} fill priority sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">{index + 1}/{count}</span>
      </button>
      {count > 1 && (
        <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Vignettes des photos">
          {thumbs.map((m, i) => (
            <button
              key={m.id}
              onClick={() => onIndexChange(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              className={cn("relative aspect-square overflow-hidden rounded-lg transition-all", i === index ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-75 hover:opacity-100")}
            >
              <Image src={m.url} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
          {count > 5 && (
            <button onClick={onOpen} className="relative aspect-square overflow-hidden rounded-lg bg-black/50 text-xs font-bold text-white">
              <Image src={media[5].url} alt="" fill sizes="120px" className="object-cover opacity-50" />
              +{count - 5}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GalleryDialog({
  media, title, open, onOpenChange, index, onIndexChange,
}: {
  media: DetailListing["media"];
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  index: number;
  onIndexChange: (i: number) => void;
}) {
  const count = media.length;

  useEffect(() => {
    if (!open || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, index, onIndexChange]);

  if (count === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] border-0 bg-black p-0" aria-describedby={undefined}>
        <div className="relative h-full w-full" role="region" aria-label={`Galerie de ${title}`}>
          <Image src={media[index]?.url ?? media[0].url} alt={`${title} — photo ${index + 1}`} fill sizes="96vw" className="object-contain" />
          <span className="absolute right-4 top-4 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-white">{index + 1}/{count}</span>
          {count > 1 && (
            <>
              <button onClick={() => onIndexChange((index - 1 + count) % count)} aria-label="Photo précédente" className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80">
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button onClick={() => onIndexChange((index + 1) % count)} aria-label="Photo suivante" className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80">
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialogs d'action
// ============================================================

function VisitDialog({ open, onOpenChange, listingId, listingTitle }: { open: boolean; onOpenChange: (o: boolean) => void; listingId: string; listingTitle: string }) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setDate(""); setNote(""); } }, [open]);

  async function submit() {
    if (!date) { toast.error("Choisissez une date et une heure."); return; }
    setBusy(true);
    try {
      await apiSend("/api/visits", "POST", { listingId, scheduledAt: new Date(date).toISOString(), note: note || undefined });
      toast.success("Demande de visite envoyée — le propriétaire va vous confirmer.");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) { navigate("/connexion"); return; }
      toast.error(e instanceof ApiClientError ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Demander une visite</DialogTitle>
          <DialogDescription>« {listingTitle} » — proposez un créneau, le propriétaire confirmera sous peu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="visit-date">Date et heure</Label>
            <Input id="visit-date" type="datetime-local" value={date} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-note">Message (facultatif)</Label>
            <Textarea id="visit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Précisez votre disponibilité, vos questions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />} Envoyer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationDialog({ open, onOpenChange, listingId, listingTitle }: { open: boolean; onOpenChange: (o: boolean) => void; listingId: string; listingTitle: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setMessage(""); }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await apiSend("/api/applications", "POST", { listingId, message: message || undefined });
      toast.success("Candidature envoyée — suivez son statut dans votre espace locataire.");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) { navigate("/connexion"); return; }
      toast.error(e instanceof ApiClientError ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Candidater à cette location</DialogTitle>
          <DialogDescription>« {listingTitle} » — présentez-vous en quelques lignes pour mettre toutes les chances de votre côté.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="apply-message">Votre message au propriétaire</Label>
          <Textarea
            id="apply-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="Bonjour, je suis intéressé(e) par ce logement. Je suis… (profession, composition du foyer, durée souhaitée, garant si applicable)"
          />
          <p className="text-right text-xs text-muted-foreground">{message.length}/1000</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />} Envoyer ma candidature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange, listingId }: { open: boolean; onOpenChange: (o: boolean) => void; listingId: string }) {
  const [reason, setReason] = useState<string>("SCAM");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason("SCAM"); setDetails(""); } }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await apiSend("/api/public/report", "POST", { listingId, reason, details: details || undefined });
      toast.success("Signalement reçu — notre équipe de modération va l'examiner.");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) { navigate("/connexion"); return; }
      toast.error(e instanceof ApiClientError ? e.message : "Signalement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Signaler cette annonce</DialogTitle>
          <DialogDescription>Votre signalement est confidentiel et transmis à notre équipe de modération.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motif du signalement</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Motif du signalement"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => <SelectItem key={r} value={r}>{label(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">Détails (facultatif)</Label>
            <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Décrivez ce qui vous semble suspect…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />} Signaler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Réservation de meublé + paiement
// ============================================================

function BookingDialog({
  open, onOpenChange, listing, onBooked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  listing: DetailListing;
  onBooked: (bookingId: string, amount: number) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [guests, setGuests] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setStart(""); setEnd(""); setGuests(1); } }, [open]);

  const { data: calendar } = useQuery({
    queryKey: ["booking-calendar", listing.id],
    queryFn: () => apiGet<BookingCalendar>(`/api/bookings?listingId=${listing.id}`),
    enabled: open,
    staleTime: 30_000,
  });

  const nights = useMemo(() => {
    if (!start || !end) return 0;
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
    return diff > 0 ? diff : 0;
  }, [start, end]);

  const estimate = nights > 0 ? bookingTotal({ nights, dailyPrice: listing.dailyPrice, weeklyPrice: listing.weeklyPrice, monthlyPrice: listing.monthlyPrice }) : 0;

  async function submit() {
    if (!start || !end || nights <= 0) { toast.error("Choisissez une date d'arrivée et de départ."); return; }
    setBusy(true);
    try {
      const booking = await apiSend<{ id: string; totalAmount: number; code: string }>("/api/bookings", "POST", {
        listingId: listing.id, startDate: start, endDate: end, guests,
      });
      toast.success(`Réservation ${booking.code} créée — finalisez le paiement.`);
      onBooked(booking.id, booking.totalAmount);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) { navigate("/connexion"); return; }
      toast.error(e instanceof ApiClientError ? e.message : "Réservation impossible.");
    } finally {
      setBusy(false);
    }
  }

  const occupied = [...(calendar?.bookings ?? []).map((b) => ({ from: b.startDate, to: b.endDate, label: "Réservé" })), ...(calendar?.blocks ?? []).map((b) => ({ from: b.startDate, to: b.endDate, label: b.reason ?? "Indisponible" }))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Réserver ce meublé</DialogTitle>
          <DialogDescription>Choisissez vos dates — le paiement se règle en ligne, sans caution.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bk-start">Arrivée</Label>
              <Input id="bk-start" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-end">Départ</Label>
              <Input id="bk-end" type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-guests">Nombre de personnes</Label>
            <Input id="bk-guests" type="number" inputMode="numeric" min={1} max={20} value={guests} onChange={(e) => setGuests(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
          </div>

          {nights > 0 && (
            <div className="rounded-xl bg-primary/5 p-3 text-sm ring-1 ring-primary/15">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{nights} nuit{nights > 1 ? "s" : ""}</span>
                <span className="font-display text-lg font-bold text-primary">{formatFcfa(estimate)}</span>
              </div>
              {listing.minStayDays && nights < listing.minStayDays && (
                <p className="mt-1 text-xs font-medium text-destructive">Séjour minimum : {listing.minStayDays} nuits.</p>
              )}
            </div>
          )}

          {occupied.length > 0 && (
            <div className="rounded-xl border border-dashed p-3">
              <p className="text-xs font-semibold">Dates déjà occupées ou bloquées :</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {occupied.slice(0, 6).map((o, i) => (
                  <li key={i} className="inline-flex items-center gap-1">
                    <Ban className="size-3 text-destructive" aria-hidden />
                    du {formatDate(o.from)} au {formatDate(o.to)} {o.label !== "Réservé" ? `(${o.label})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={busy || nights <= 0 || (listing.minStayDays != null && nights < listing.minStayDays)}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />} Réserver {estimate > 0 ? `— ${formatFcfa(estimate)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Avis locataires
// ============================================================

function ReviewsSection({ reviews }: { reviews: DetailListing["reviews"] }) {
  if (reviews.length === 0) {
    return (
      <section aria-label="Avis">
        <h2 className="font-display text-lg font-bold">Avis locataires</h2>
        <p className="mt-2 text-sm text-muted-foreground">Aucun avis pour le moment — les avis sont publiés par des locataires ayant réellement vécu dans le logement.</p>
      </section>
    );
  }
  const avg = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
  return (
    <section aria-label="Avis">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold">Avis locataires</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />
          {avg.toFixed(1)} · {reviews.length} avis
        </span>
      </div>
      <ul className="mt-3 space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary" aria-hidden>{initials(r.author)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.author}</p>
                <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
              </div>
              <span className="ml-auto flex shrink-0" aria-label={`${r.rating} sur 5`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn("size-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} aria-hidden />
                ))}
              </span>
            </div>
            {r.comment && <p className="mt-2.5 text-sm leading-relaxed text-foreground/90">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Squelette de chargement
// ============================================================

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
