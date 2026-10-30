"use client";

// ============================================================
// LocaBénin — Espace Démarcheur : mes liens & QR codes
// URL complète, partage WhatsApp / Facebook / SMS, QR (généré
// côté serveur via /api/agent?qr=CODE, anti-IDOR), stats par lien.
// ============================================================

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  Link2, Copy, MessageCircle, Facebook, MessageSquare, QrCode, Loader2,
  MousePointerClick, BadgeCheck, MapPin, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/shared/states";
import { navigate } from "@/lib/client/router";
import { formatFcfa, formatDate } from "@/lib/finance";
import { label } from "@/lib/constants";
import { toast } from "sonner";
import { guardedGet, mutationError, type AgentData } from "./api";

export function AgentLinks() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const data = useQuery({
    queryKey: ["agent"],
    queryFn: () => guardedGet<AgentData>("/api/agent"),
  });

  const links = data.data?.links ?? [];

  function fullUrl(link: { listingId: string; code: string }): string {
    return `${window.location.origin}/#/offres/${link.listingId}?ref=${link.code}`;
  }

  function shareText(link: { listingId: string; code: string }, title: string): string {
    return `Découvrez « ${title} » sur LocaBénin : ${fullUrl(link)} — logement vérifié, bail électronique et paiement Mobile Money sécurisés.`;
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url)
      .then(() => toast.success("Lien copié — partagez-le partout !"))
      .catch(() => toast.error("Copie impossible sur ce navigateur."));
  }

  async function showQr(code: string) {
    setQrCode(code);
    setQrImg(null);
    setQrLoading(true);
    try {
      const res = await guardedGet<{ dataUrl: string; url: string }>(`/api/agent?qr=${encodeURIComponent(code)}`);
      setQrImg(res.dataUrl);
      setQrUrl(res.url);
    } catch (e) {
      toast.error(mutationError(e, "Génération du QR impossible."));
      setQrCode(null);
    } finally {
      setQrLoading(false);
    }
  }

  async function createSampleLink() {
    setCreating(true);
    try {
      navigate("/demarcheur/catalogue");
      toast.info("Choisissez une offre dans le catalogue pour générer un lien.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Mes liens &amp; QR codes</h2>
          <p className="text-sm text-muted-foreground">Un lien par offre — chaque clic est compté, chaque location via votre lien vous rapporte.</p>
        </div>
        <Button variant="outline" className="min-h-[44px]" disabled={creating} onClick={() => void createSampleLink()}>
          <Link2 className="size-4" aria-hidden /> Obtenir un nouveau lien
        </Button>
      </div>

      {data.isLoading && <RowsSkeleton rows={3} />}
      {data.isError && <ErrorState message="Impossible de charger vos liens." onRetry={() => void data.refetch()} />}

      {!data.isLoading && !data.isError && links.length === 0 && (
        <EmptyState
          icon={Link2}
          title="Aucun lien pour l'instant"
          description="Parcourez le catalogue affiliable et cliquez sur « Obtenir mon lien » pour démarrer vos promotions."
          actionLabel="Voir le catalogue"
          actionHref="/demarcheur/catalogue"
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {links.map((link) => (
          <article key={link.id} className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5" aria-label={`Lien pour ${link.listing.title}`}>
            <div className="flex items-start gap-3">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-xl border bg-surface">
                {link.listing.coverUrl ? (
                  <Image src={link.listing.coverUrl} alt="" fill sizes="64px" className="object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-muted-foreground"><MapPin className="size-6" aria-hidden /></span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <button onClick={() => navigate(`/offres/${link.listingId}`)} className="truncate text-left font-display text-base font-bold hover:text-primary hover:underline">
                  {link.listing.title}
                </button>
                <p className="text-xs text-muted-foreground">
                  {link.listing.reference} · {formatFcfa(link.listing.rentAmount)} / {label(link.listing.rentPeriod)} · créé le {formatDate(link.createdAt)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MousePointerClick className="size-3.5" aria-hidden /> {link.clicks} clic(s)
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <BadgeCheck className="size-3.5" aria-hidden /> {link.commissionsCount} commission(s) — {formatFcfa(link.commissionsTotal)}
                  </span>
                </p>
              </div>
            </div>

            {/* URL + code */}
            <div className="mt-3 rounded-xl bg-secondary/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Code affiliation : <span className="font-mono text-xs text-primary">{link.code}</span></p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{typeof window !== "undefined" ? fullUrl(link) : ""}</p>
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="min-h-[44px] flex-1" onClick={() => copy(fullUrl(link))}>
                <Copy className="size-4" aria-hidden /> Copier
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText(link, link.listing.title))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl(link))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary/60"
              >
                <Facebook className="size-4" aria-hidden /> Facebook
              </a>
              <a
                href={`sms:?body=${encodeURIComponent(shareText(link, link.listing.title))}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary/60"
              >
                <MessageSquare className="size-4" aria-hidden /> SMS
              </a>
              <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => void showQr(link.code)} aria-label={`Afficher le QR code du lien ${link.code}`}>
                <QrCode className="size-4" aria-hidden /> QR
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Dialogue QR */}
      <Dialog open={Boolean(qrCode)} onOpenChange={(v) => { if (!v) setQrCode(null); }}>
        <DialogContent className="max-w-sm" aria-describedby="qr-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="size-5 text-primary" aria-hidden /> QR code d&apos;affiliation</DialogTitle>
            <DialogDescription id="qr-desc">
              Imprimez-le ou montrez-le à l&apos;écran : le scan ouvre la fiche de l&apos;offre avec votre attribution.
            </DialogDescription>
          </DialogHeader>
          {qrLoading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">Génération du QR code…</p>
            </div>
          ) : qrImg ? (
            <div className="flex flex-col items-center gap-3">
              <img src={qrImg} alt={`QR code du lien ${qrCode}`} className="size-64 rounded-xl border bg-white p-2" />
              <p className="break-all text-center font-mono text-[11px] text-muted-foreground">{qrUrl}</p>
              <Button className="w-full" onClick={() => copy(qrUrl)}>
                <Copy className="size-4" aria-hidden /> Copier le lien du QR
              </Button>
              <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Tester le lien <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
