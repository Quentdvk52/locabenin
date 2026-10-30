"use client";

// ============================================================
// LocaBénin — Assistant de publication d'offre (5 étapes)
// Création ET modification (listingId en prop). Chaque étape est
// validée localement avant passage ; l'envoi se fait à l'étape 5
// (POST création / PUT modification). Images compressées en WebP
// côté client (max 1600 px) puis téléversées via /api/uploads.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Upload, Trash2, Star, StarOff, ChevronLeft, ChevronRight,
  ImagePlus, FileVideo, Loader2, Sparkles, Crown, ScrollText, MapPin,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/session";
import { formatFcfa } from "@/lib/finance";
import { navigate } from "@/lib/client/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { WizardStepper, MoneyInput } from "@/components/shared/form-bits";
import { ErrorState } from "@/components/shared/states";
import { label, LISTING_TYPES } from "@/lib/constants";
import { toast } from "sonner";
import { handleApiError } from "./components/helpers";
import { cn } from "@/lib/utils";

// ---------- Types ----------

type Genre = "SIMPLE" | "FURNISHED";
type MediaKind = "IMAGE" | "VIDEO";
interface MediaItem { url: string; kind: MediaKind; isCover: boolean }
interface DepositOption { label: string; amount: number }
interface GeoDepartement { id: string; code: string; name: string; communes: Array<{ id: string; name: string; areas: Array<{ id: string; name: string; kind: string }> }> }
interface GeoCommune { id: string; name: string; areas: Array<{ id: string; name: string; kind: string }> }
interface AmenityRow { code: string; label: string; group: string }
interface PropertyRow { id: string; name: string; listingsCount: number }

interface WizardData {
  title: string;
  description: string;
  type: string;
  genre: Genre;
  bedrooms: number;
  bathrooms: number;
  livingRooms: number;
  surfaceM2: string;
  addressText: string;
  deptCode: string;
  communeId: string;
  areaId: string;
  latitude: string;
  longitude: string;
  propertyId: string;
  rentAmount: number;
  rentPeriod: string;
  depositAmount: number;
  advanceMonths: number;
  depositOptions: DepositOption[];
  dailyPrice: number;
  weeklyPrice: number;
  monthlyPrice: number;
  minStayDays: number;
  rulesText: string;
  affiliateEnabled: boolean;
  amenities: string[];
  media: MediaItem[];
}

const EMPTY: WizardData = {
  title: "", description: "", type: "APARTMENT", genre: "SIMPLE",
  bedrooms: 1, bathrooms: 1, livingRooms: 0, surfaceM2: "",
  addressText: "", deptCode: "", communeId: "", areaId: "",
  latitude: "", longitude: "", propertyId: "",
  rentAmount: 0, rentPeriod: "MONTH", depositAmount: 0, advanceMonths: 0, depositOptions: [],
  dailyPrice: 0, weeklyPrice: 0, monthlyPrice: 0, minStayDays: 1,
  rulesText: "", affiliateEnabled: false, amenities: [], media: [],
};

const STEPS = ["Type & localisation", "Détails", "Tarification", "Équipements & médias", "Options & récap"];

const PERIODS = ["MONTH", "QUARTER", "SEMESTER", "LEASE", "DAY", "WEEK"] as const;
const AMENITY_GROUPS: Record<string, string> = {
  CONFORT: "Confort", SECURITE: "Sécurité", EXTERIEUR: "Extérieur", SERVICES: "Services",
};
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

function bedroomsLabel(n: number): string {
  if (n === -1) return "Chambre-salon";
  if (n === 0) return "Studio";
  return `${n} chambre${n > 1 ? "s" : ""}`;
}

/** Compression image → WebP max 1600 px (canvas natif). */
async function compressToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression impossible"))),
      "image/webp",
      0.82,
    );
  });
}

export default function ListingWizard({ listingId }: { listingId?: string }) {
  const qc = useQueryClient();
  const isEdit = Boolean(listingId);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [depositLabel, setDepositLabel] = useState("");
  const [depositAmountInput, setDepositAmountInput] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof WizardData>(key: K, value: WizardData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  // ---- Référentiels ----
  const geo = useQuery<GeoDepartement[]>({
    queryKey: ["public", "geo"],
    queryFn: () => apiGet<GeoDepartement[]>("/api/public/geo"),
    staleTime: 5 * 60_000,
  });
  const amenitiesQ = useQuery<AmenityRow[]>({
    queryKey: ["public", "amenities"],
    queryFn: () => apiGet<AmenityRow[]>("/api/public/amenities"),
    staleTime: 5 * 60_000,
  });
  const propertiesQ = useQuery<PropertyRow[]>({
    queryKey: ["owner", "properties"],
    queryFn: () => apiGet<PropertyRow[]>("/api/owner/properties"),
    staleTime: 30_000,
  });

  // ---- Mode édition : pré-remplissage ----
  const existing = useQuery({
    queryKey: ["owner", "listing", listingId],
    queryFn: () => apiGet<Record<string, unknown>>(`/api/owner/listings/${listingId}`),
    enabled: isEdit,
    retry: false,
  });

  useEffect(() => {
    const d = existing.data as null | {
      title: string; description: string; type: string; genre: Genre;
      bedrooms: number; bathrooms: number; livingRooms: number; surfaceM2: number | null;
      addressText: string | null; areaId: string | null; latitude: number | null; longitude: number | null;
      propertyId: string | null;
      rentAmount: number; rentPeriod: string; depositAmount: number; advanceMonths: number;
      dailyPrice: number | null; weeklyPrice: number | null; monthlyPrice: number | null; minStayDays: number | null;
      rulesText: string | null; affiliateEnabled: boolean;
      amenities: string[]; depositOptions: DepositOption[]; media: MediaItem[];
      area: { name: string; commune: string | null; departmentCode: string | null } | null;
    };
    if (!d) return;
    const dept = d.area?.departmentCode ?? "";
    const commune = geo.data?.find((dep) => dep.code === dept)?.communes.find((c) => c.name === d.area?.commune);
    setData({
      title: d.title,
      description: d.description,
      type: d.type,
      genre: d.genre,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      livingRooms: d.livingRooms ?? 0,
      surfaceM2: d.surfaceM2 ? String(d.surfaceM2) : "",
      addressText: d.addressText ?? "",
      deptCode: dept,
      communeId: commune?.id ?? "",
      areaId: d.areaId ?? "",
      latitude: d.latitude != null ? String(d.latitude) : "",
      longitude: d.longitude != null ? String(d.longitude) : "",
      propertyId: d.propertyId ?? "",
      rentAmount: d.genre === "SIMPLE" ? d.rentAmount : 0,
      rentPeriod: d.rentPeriod || "MONTH",
      depositAmount: d.depositAmount ?? 0,
      advanceMonths: d.advanceMonths ?? 0,
      depositOptions: d.depositOptions ?? [],
      dailyPrice: d.dailyPrice ?? 0,
      weeklyPrice: d.weeklyPrice ?? 0,
      monthlyPrice: d.monthlyPrice ?? 0,
      minStayDays: d.minStayDays ?? 1,
      rulesText: d.rulesText ?? "",
      affiliateEnabled: d.affiliateEnabled,
      amenities: d.amenities ?? [],
      media: d.media ?? [],
    });
  }, [existing.data, geo.data]);

  const commune = useMemo<GeoCommune | null>(
    () => geo.data?.find((d) => d.code === data.deptCode)?.communes.find((c) => c.id === data.communeId) ?? null,
    [geo.data, data.deptCode, data.communeId],
  );

  // ---- Validation par étape ----
  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!data.type) return "Choisissez le type de bien.";
      if (!data.deptCode) return "Choisissez le département.";
      if (!data.communeId) return "Choisissez la commune.";
      if (!data.areaId) return "Choisissez le quartier.";
      if (data.addressText.trim().length < 6) return "Saisissez l'adresse complète (au moins 6 caractères).";
    }
    if (s === 1) {
      if (data.description.trim().length < 30) return "La description doit faire au moins 30 caractères.";
      if (data.surfaceM2 && (isNaN(Number(data.surfaceM2)) || Number(data.surfaceM2) < 5)) return "Surface invalide (min. 5 m²).";
    }
    if (s === 2) {
      if (data.genre === "SIMPLE") {
        if (data.rentAmount <= 0) return "Indiquez le montant du loyer.";
        if (data.advanceMonths < 0 || data.advanceMonths > 12) return "Avances : entre 0 et 12 mois.";
        if (data.depositOptions.some((o) => !o.label.trim() || o.amount <= 0)) return "Chaque caution optionnelle doit avoir un libellé et un montant positif.";
      } else {
        if (data.dailyPrice <= 0) return "Indiquez le tarif journalier du meublé.";
        if (data.minStayDays < 1) return "Séjour minimum : au moins 1 nuit.";
      }
    }
    if (s === 3) {
      if (data.media.length === 0) return "Ajoutez au moins une photo.";
      if (!data.media.some((m) => m.kind === "IMAGE")) return "Ajoutez au moins une image (pas seulement une vidéo).";
    }
    if (s === 4) {
      if (data.title.trim().length < 8) return "Le titre doit faire au moins 8 caractères.";
      if (data.depositOptions.some((o) => !o.label.trim() || o.amount <= 0)) return "Chaque caution optionnelle doit avoir un libellé et un montant positif.";
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Upload médias ----
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith("image/"));
    const videos = list.filter((f) => f.type.startsWith("video/"));
    if (list.length !== images.length + videos.length) {
      toast.error("Formats acceptés : images et vidéos uniquement.");
    }
    const tooHeavy = videos.find((v) => v.size > MAX_VIDEO_BYTES);
    if (tooHeavy) toast.error(`« ${tooHeavy.name} » dépasse 40 Mo — compressez la vidéo d'abord.`);

    const jobs = [
      ...images.map(async (f) => {
        const blob = await compressToWebp(f);
        return { file: new File([blob], f.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" }), kind: "IMAGE" as MediaKind };
      }),
      ...videos.filter((v) => v.size <= MAX_VIDEO_BYTES).map(async (f) => ({ file: f, kind: "VIDEO" as MediaKind })),
    ];
    setUploading({ done: 0, total: jobs.length });
    const uploaded: MediaItem[] = [];
    let i = 0;
    for (const job of jobs) {
      try {
        const form = new FormData();
        form.append("file", job.file);
        form.append("kind", job.kind);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const json = (await res.json()) as { ok: boolean; data?: { url: string }; error?: string };
        if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "Téléversement impossible");
        uploaded.push({ url: json.data.url, kind: job.kind, isCover: false });
      } catch (e) {
        handleApiError(e, "Téléversement impossible.");
      }
      i++;
      setUploading({ done: i, total: jobs.length });
    }
    setData((d) => {
      const media = [...d.media, ...uploaded];
      if (!media.some((m) => m.isCover && m.kind === "IMAGE")) {
        const firstImage = media.findIndex((m) => m.kind === "IMAGE");
        if (firstImage >= 0) {
          for (let j = 0; j < media.length; j++) media[j] = { ...media[j], isCover: j === firstImage };
        }
      }
      return { ...d, media };
    });
    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function moveMedia(index: number, dir: -1 | 1) {
    setData((d) => {
      const media = [...d.media];
      const target = index + dir;
      if (target < 0 || target >= media.length) return d;
      [media[index], media[target]] = [media[target], media[index]];
      return { ...d, media };
    });
  }
  function removeMedia(index: number) {
    setData((d) => {
      const media = d.media.filter((_, i) => i !== index);
      return { ...d, media };
    });
  }
  function setCover(index: number) {
    setData((d) => ({ ...d, media: d.media.map((m, i) => ({ ...m, isCover: i === index && d.media[index].kind === "IMAGE" })) }));
  }

  // ---- Envoi final ----
  function buildPayload(): Record<string, unknown> | null {
    const surface = data.surfaceM2.trim() ? Number(data.surfaceM2) : null;
    const lat = data.latitude.trim() ? Number(data.latitude) : null;
    const lng = data.longitude.trim() ? Number(data.longitude) : null;
    const isFurnished = data.genre === "FURNISHED";
    const media = data.media.map((m, i) => ({ url: m.url, kind: m.kind, position: i, isCover: i === 0 && m.kind === "IMAGE" }));
    if (isFurnished && !media.some((m) => m.isCover)) {
      const firstImage = media.find((m) => m.kind === "IMAGE");
      if (firstImage) firstImage.isCover = true;
    }
    return {
      title: data.title.trim(),
      description: data.description.trim(),
      type: data.type,
      genre: data.genre,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      livingRooms: data.livingRooms,
      surfaceM2: surface,
      addressText: data.addressText.trim(),
      areaId: data.areaId,
      latitude: lat,
      longitude: lng,
      propertyId: data.propertyId || null,
      rentAmount: isFurnished ? data.dailyPrice : data.rentAmount,
      rentPeriod: isFurnished ? "DAY" : data.rentPeriod,
      depositAmount: isFurnished ? 0 : data.depositAmount,
      advanceMonths: isFurnished ? 0 : data.advanceMonths,
      depositOptions: isFurnished ? [] : data.depositOptions.filter((o) => o.label.trim() && o.amount > 0),
      dailyPrice: isFurnished ? data.dailyPrice : null,
      weeklyPrice: isFurnished ? (data.weeklyPrice > 0 ? data.weeklyPrice : null) : null,
      monthlyPrice: isFurnished ? (data.monthlyPrice > 0 ? data.monthlyPrice : null) : null,
      minStayDays: isFurnished ? data.minStayDays : null,
      rulesText: data.rulesText.trim() || null,
      affiliateEnabled: data.affiliateEnabled,
      amenities: data.amenities,
      media,
    };
  }

  async function submit() {
    for (let s = 0; s < STEPS.length - 1; s++) {
      const err = validateStep(s);
      if (err) {
        toast.error(err);
        setStep(s);
        return;
      }
    }
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (isEdit && listingId) {
        await apiSend(`/api/owner/listings/${listingId}`, "PUT", payload);
        toast.success("Offre mise à jour.");
      } else {
        const res = await apiSend<{ reference: string; status: string }>("/api/owner/listings", "POST", payload);
        toast.success(`Offre ${res.reference} créée.`, {
          description: res.status === "PUBLISHED" ? "Elle est en ligne immédiatement." : "Elle est en cours de validation par l'équipe (sous 24 h).",
        });
      }
      void qc.invalidateQueries({ queryKey: ["owner"] });
      navigate("/proprietaire/biens");
    } catch (e) {
      handleApiError(e, "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && existing.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState message="Offre introuvable ou accès refusé." onRetry={() => navigate("/proprietaire/biens")} />
      </div>
    );
  }
  if (isEdit && existing.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Chargement de l&apos;offre…
      </div>
    );
  }

  const entryTotal = data.genre === "SIMPLE"
    ? data.rentAmount + data.depositAmount + data.rentAmount * data.advanceMonths + data.depositOptions.reduce((a, o) => a + o.amount, 0)
    : data.dailyPrice;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {isEdit ? "Modifier l'offre" : "Publier une offre"}
          </h1>
          <p className="text-sm text-muted-foreground">Assistant en 5 étapes — vous publiez à la fin.</p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/proprietaire/biens")}>
          <ArrowLeft className="size-4" aria-hidden /> Retour
        </Button>
      </div>

      <WizardStepper steps={STEPS} current={step} />

      {/* ================= ÉTAPE 1 : Type & localisation ================= */}
      {step === 0 && (
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Type et localisation">
          <div className="space-y-2">
            <Label htmlFor="w-type">Type de bien</Label>
            <Select value={data.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger id="w-type" className="h-11 w-full sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LISTING_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{label(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mode de location</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { code: "SIMPLE" as Genre, title: "Location simple", desc: "Caution et avances possibles, échéancier de loyer mensuel. Idéal maisons, appartements vides, bureaux." },
                { code: "FURNISHED" as Genre, title: "Meublé (court séjour)", desc: "Sans caution, paiement en ligne à la réservation (jour/semaine/mois), calendrier de disponibilité." },
              ]).map((g) => (
                <button
                  key={g.code}
                  type="button"
                  onClick={() => set("genre", g.code)}
                  aria-pressed={data.genre === g.code}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    data.genre === g.code ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-secondary/60",
                  )}
                >
                  <p className="flex items-center gap-2 font-semibold">
                    <Sparkles className={cn("size-4", data.genre === g.code ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    {g.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.desc}</p>
                </button>
              ))}
            </div>
            {data.genre === "FURNISHED" && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                Règles des meublés : pas de caution ni d&apos;avances, tarification à la journée/semaine/mois, paiement en ligne obligatoire à la réservation.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="w-dept">Département</Label>
              <Select
                value={data.deptCode}
                onValueChange={(v) => { set("deptCode", v); set("communeId", ""); set("areaId", ""); }}
              >
                <SelectTrigger id="w-dept" className="h-11 w-full"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {(geo.data ?? []).map((d) => <SelectItem key={d.id} value={d.code}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-commune">Commune</Label>
              <Select value={data.communeId} onValueChange={(v) => { set("communeId", v); set("areaId", ""); }} disabled={!data.deptCode}>
                <SelectTrigger id="w-commune" className="h-11 w-full"><SelectValue placeholder={data.deptCode ? "Choisir" : "Département d'abord"} /></SelectTrigger>
                <SelectContent>
                  {(geo.data?.find((d) => d.code === data.deptCode)?.communes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-area">Quartier</Label>
              <Select value={data.areaId} onValueChange={(v) => set("areaId", v)} disabled={!data.communeId}>
                <SelectTrigger id="w-area" className="h-11 w-full"><SelectValue placeholder={data.communeId ? "Choisir" : "Commune d'abord"} /></SelectTrigger>
                <SelectContent>
                  {(commune?.areas ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-address">Adresse (rue, repère…)</Label>
            <Input id="w-address" value={data.addressText} onChange={(e) => set("addressText", e.target.value)} placeholder="Ex. Rue 12.285, à 100 m du carrefour Vedoko" className="h-11" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="w-lat">Latitude (optionnel)</Label>
              <Input id="w-lat" inputMode="decimal" value={data.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="6.3654" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-lng">Longitude (optionnel)</Label>
              <Input id="w-lng" inputMode="decimal" value={data.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="2.4183" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-property">Rattacher à un immeuble (optionnel)</Label>
            <Select value={data.propertyId || "none"} onValueChange={(v) => set("propertyId", v === "none" ? "" : v)}>
              <SelectTrigger id="w-property" className="h-11 w-full sm:w-80"><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun immeuble</SelectItem>
                {(propertiesQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.listingsCount} offre{p.listingsCount > 1 ? "s" : ""})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>
      )}

      {/* ================= ÉTAPE 2 : Détails ================= */}
      {step === 1 && (
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Détails du bien">
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              { key: "bedrooms" as const, title: "Chambres", min: -1, max: 15, hint: "−1 = chambre-salon · 0 = studio", fmt: bedroomsLabel },
              { key: "bathrooms" as const, title: "Douches / salles d'eau", min: 0, max: 10, hint: undefined, fmt: (n: number) => String(n) },
              { key: "livingRooms" as const, title: "Salons", min: 0, max: 5, hint: undefined, fmt: (n: number) => String(n) },
            ]).map((f) => (
              <div key={f.key} className="rounded-xl border p-4">
                <p className="text-sm font-medium">{f.title}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button variant="outline" size="icon" className="size-9" aria-label={`Retirer ${f.title}`} onClick={() => set(f.key, Math.max(f.min, data[f.key] - 1))}>−</Button>
                  <span className="font-display text-lg font-bold">{f.fmt(data[f.key])}</span>
                  <Button variant="outline" size="icon" className="size-9" aria-label={`Ajouter ${f.title}`} onClick={() => set(f.key, Math.min(f.max, data[f.key] + 1))}>+</Button>
                </div>
                {f.hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>

          <div className="space-y-2 max-w-56">
            <Label htmlFor="w-surface">Surface (m²)</Label>
            <Input id="w-surface" inputMode="numeric" value={data.surfaceM2} onChange={(e) => set("surfaceM2", e.target.value.replace(/[^\d]/g, ""))} placeholder="Ex. 85" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-desc">Description détaillée</Label>
            <Textarea
              id="w-desc"
              value={data.description}
              onChange={(e) => set("description", e.target.value)}
              rows={7}
              placeholder="Décrivez le bien : agencement, état, environnement (commerces, transports, écoles), points forts…"
              className="min-h-36"
            />
            <p className={cn("text-xs", data.description.trim().length >= 30 ? "text-emerald-600" : "text-muted-foreground")}>
              {data.description.trim().length} / 30 caractères minimum
            </p>
          </div>
        </section>
      )}

      {/* ================= ÉTAPE 3 : Tarification ================= */}
      {step === 2 && (
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Tarification">
          {data.genre === "SIMPLE" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Loyer ({PERIODS.includes(data.rentPeriod as (typeof PERIODS)[number]) ? "par période" : ""})</Label>
                  <MoneyInput value={data.rentAmount} onChange={(v) => set("rentAmount", v)} ariaLabel="Montant du loyer" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="w-period">Périodicité</Label>
                  <Select value={data.rentPeriod} onValueChange={(v) => set("rentPeriod", v)}>
                    <SelectTrigger id="w-period" className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => <SelectItem key={p} value={p}>Par {label(p)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Mois d&apos;avance à l&apos;entrée</p>
                    <p className="text-xs text-muted-foreground">Avances exigées avant l&apos;emménagement (0 à 12 mois).</p>
                  </div>
                  <span className="font-display text-lg font-bold">{data.advanceMonths} mois</span>
                </div>
                <Slider
                  value={[data.advanceMonths]}
                  onValueChange={([v]) => set("advanceMonths", v)}
                  min={0}
                  max={12}
                  step={1}
                  className="mt-3"
                  aria-label="Mois d'avance"
                />
              </div>

              <div className="space-y-2">
                <Label>Caution principale</Label>
                <MoneyInput value={data.depositAmount} onChange={(v) => set("depositAmount", v)} ariaLabel="Montant de la caution" />
                <p className="text-xs text-muted-foreground">Souvent 1 à 3 mois de loyer — libre selon votre pratique.</p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm font-medium">Cautions optionnelles (libellés libres)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Ex. « Caution eau (SONEB) », « Compteur électrique (SBEE) », « Forage »…</p>
                <div className="mt-3 space-y-2">
                  {data.depositOptions.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={o.label}
                        onChange={(e) => setData((d) => ({ ...d, depositOptions: d.depositOptions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                        placeholder="Libellé"
                        aria-label={`Libellé de la caution ${i + 1}`}
                        className="h-10 flex-1"
                      />
                      <MoneyInput
                        value={o.amount}
                        onChange={(v) => setData((d) => ({ ...d, depositOptions: d.depositOptions.map((x, j) => (j === i ? { ...x, amount: v } : x)) }))}
                        className="w-44"
                        ariaLabel={`Montant de la caution ${i + 1}`}
                      />
                      <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Supprimer la caution ${i + 1}`} onClick={() => setData((d) => ({ ...d, depositOptions: d.depositOptions.filter((_, j) => j !== i) }))}>
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="w-dep-label" className="text-xs">Nouvelle caution</Label>
                      <Input id="w-dep-label" value={depositLabel} onChange={(e) => setDepositLabel(e.target.value)} placeholder="Ex. Caution eau (SONEB)" className="h-10" />
                    </div>
                    <div className="w-44 space-y-1">
                      <Label className="text-xs">Montant</Label>
                      <MoneyInput value={depositAmountInput} onChange={setDepositAmountInput} ariaLabel="Montant de la nouvelle caution" />
                    </div>
                    <Button
                      variant="secondary"
                      className="h-10"
                      onClick={() => {
                        if (depositLabel.trim().length < 2) { toast.error("Saisissez un libellé pour la caution."); return; }
                        if (depositAmountInput <= 0) { toast.error("Saisissez un montant positif."); return; }
                        setData((d) => ({ ...d, depositOptions: [...d.depositOptions, { label: depositLabel.trim(), amount: depositAmountInput }] }));
                        setDepositLabel("");
                        setDepositAmountInput(0);
                      }}
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tarif par jour</Label>
                  <MoneyInput value={data.dailyPrice} onChange={(v) => set("dailyPrice", v)} ariaLabel="Tarif journalier" />
                </div>
                <div className="space-y-2">
                  <Label>Tarif par semaine (optionnel)</Label>
                  <MoneyInput value={data.weeklyPrice} onChange={(v) => set("weeklyPrice", v)} ariaLabel="Tarif hebdomadaire" />
                </div>
                <div className="space-y-2">
                  <Label>Tarif par mois (optionnel)</Label>
                  <MoneyInput value={data.monthlyPrice} onChange={(v) => set("monthlyPrice", v)} ariaLabel="Tarif mensuel" />
                </div>
              </div>
              <div className="space-y-2 max-w-56">
                <Label htmlFor="w-minstay">Séjour minimum (nuits)</Label>
                <Input id="w-minstay" inputMode="numeric" value={String(data.minStayDays)} onChange={(e) => set("minStayDays", Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, "") || "1", 10)))} />
              </div>
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                Location meublée : sans caution ni avances. Le locataire réserve et paie en ligne (jour / semaine / mois, prix dégressif automatique).
              </p>
            </>
          )}
        </section>
      )}

      {/* ================= ÉTAPE 4 : Équipements & médias ================= */}
      {step === 3 && (
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Équipements et médias">
          <div className="space-y-3">
            <p className="text-sm font-medium">Équipements & services</p>
            <div className="space-y-3">
              {Object.entries(AMENITY_GROUPS).map(([group, groupLabel]) => {
                const rows = (amenitiesQ.data ?? []).filter((a) => a.group === group);
                if (rows.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {rows.map((a) => {
                        const active = data.amenities.includes(a.code);
                        return (
                          <button
                            key={a.code}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setData((d) => ({
                                ...d,
                                amenities: active ? d.amenities.filter((c) => c !== a.code) : [...d.amenities, a.code],
                              }))
                            }
                            className={cn(
                              "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                              active ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
                            )}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Photos & vidéo</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:bg-secondary/50"
            >
              <ImagePlus className="size-8 text-primary" aria-hidden />
              <span className="text-sm font-semibold">Glissez vos fichiers ou cliquez pour parcourir</span>
              <span className="text-xs text-muted-foreground">Images (compressées automatiquement en WebP, max 1600 px) · vidéo max 40 Mo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="sr-only"
              aria-label="Ajouter des photos ou une vidéo"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {uploading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Téléversement… {uploading.done} / {uploading.total}
              </p>
            )}

            {data.media.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Médias ajoutés">
                {data.media.map((m, i) => (
                  <li key={`${m.url}-${i}`} className="overflow-hidden rounded-xl border bg-secondary/40">
                    <div className="relative aspect-[4/3]">
                      {m.kind === "IMAGE" ? (
                        <img src={m.url} alt={`Média ${i + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-muted-foreground"><FileVideo className="size-8" aria-hidden /></span>
                      )}
                      {m.isCover && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Couverture</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-0.5 p-1.5">
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Déplacer à gauche" disabled={i === 0} onClick={() => moveMedia(i, -1)}>
                        <ChevronLeft className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={m.isCover ? "Retirer la couverture" : "Définir comme couverture"} disabled={m.kind !== "IMAGE"} onClick={() => (m.isCover ? setCover(-1) : setCover(i))}>
                        {m.isCover ? <StarOff className="size-4 text-amber-600" aria-hidden /> : <Star className="size-4" aria-hidden />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Déplacer à droite" disabled={i === data.media.length - 1} onClick={() => moveMedia(i, 1)}>
                        <ChevronRight className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Supprimer ce média" onClick={() => removeMedia(i)}>
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ================= ÉTAPE 5 : Options & récapitulatif ================= */}
      {step === 4 && (
        <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Options et récapitulatif">
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold"><Crown className="size-4 text-violet-600 dark:text-violet-400" aria-hidden /> Option Démarcheur</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Permet aux démarcheurs affiliés d&apos;apporter des locataires. Commission d&apos;un demi-mois de loyer :
                  25 % payés par le locataire + 25 % par vous, crédités sur le wallet du démarcheur au paiement d&apos;entrée.
                </p>
              </div>
              <Switch checked={data.affiliateEnabled} onCheckedChange={(v) => set("affiliateEnabled", v)} aria-label="Activer l'option démarcheur" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-rules" className="flex items-center gap-2"><ScrollText className="size-4" aria-hidden /> Règlement intérieur (optionnel)</Label>
            <Textarea id="w-rules" value={data.rulesText} onChange={(e) => set("rulesText", e.target.value)} rows={4} placeholder="Ex. Animaux non admis, fêtes interdites, couvre-feu à 22 h…" />
          </div>

          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="font-display text-sm font-bold">Récapitulatif</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Titre</dt><dd className="truncate font-medium">{data.title || "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Type</dt><dd className="font-medium">{label(data.type)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Mode</dt><dd className="font-medium">{data.genre === "FURNISHED" ? "Meublé" : "Location simple"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Localisation</dt><dd className="font-medium">{geo.data?.find((d) => d.code === data.deptCode)?.name ?? "—"} › {commune?.name ?? "—"} › {commune?.areas.find((a) => a.id === data.areaId)?.name ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Capacité</dt><dd className="font-medium">{bedroomsLabel(data.bedrooms)} · {data.bathrooms} douche(s){data.livingRooms > 0 ? ` · ${data.livingRooms} salon(s)` : ""}</dd></div>
              {data.genre === "SIMPLE" ? (
                <>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Loyer</dt><dd className="font-medium">{formatFcfa(data.rentAmount)} / {label(data.rentPeriod)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Caution</dt><dd className="font-medium">{formatFcfa(data.depositAmount)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Avances</dt><dd className="font-medium">{data.advanceMonths} mois ({formatFcfa(data.rentAmount * data.advanceMonths)})</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Cautions optionnelles</dt><dd className="font-medium">{data.depositOptions.length}</dd></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Tarif jour</dt><dd className="font-medium">{formatFcfa(data.dailyPrice)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Semaine / mois</dt><dd className="font-medium">{data.weeklyPrice > 0 ? formatFcfa(data.weeklyPrice) : "—"} / {data.monthlyPrice > 0 ? formatFcfa(data.monthlyPrice) : "—"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Séjour minimum</dt><dd className="font-medium">{data.minStayDays} nuit(s)</dd></div>
                </>
              )}
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Équipements</dt><dd className="font-medium">{data.amenities.length} sélectionné(s)</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Médias</dt><dd className="font-medium">{data.media.length} fichier(s)</dd></div>
              <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Coût total à l&apos;entrée (estimation)</dt><dd className="font-display font-bold text-primary">{formatFcfa(entryTotal)}</dd></div>
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden /> {data.addressText || "Adresse à compléter"}
            </p>
          </div>
        </section>
      )}

      {/* ---- Navigation ---- */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={back} disabled={step === 0} className="h-11">
          <ArrowLeft className="size-4" aria-hidden /> Précédent
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} className="h-11">
            Suivant <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button onClick={() => void submit()} disabled={saving} className="h-11 min-w-40">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {isEdit ? "Enregistrer les modifications" : "Publier l'offre"}
          </Button>
        )}
      </div>
    </div>
  );
}
