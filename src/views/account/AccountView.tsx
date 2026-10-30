"use client";

// ============================================================
// LocaBénin — Mon compte : profil, KYC (pièce + selfie), sécurité
// Les documents KYC sont stockés hors accès public ; seuls les admins
// les consultent via URLs réservées (bucket privé en production).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Camera, ShieldCheck, Loader2, CheckCircle2, Clock, XCircle, User, LogOut, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublicHeader, PublicTabBar } from "@/components/layout/chrome";
import { KycBadge } from "@/components/shared/badges";
import { useSession, apiGet, apiSend, ApiClientError } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import { label } from "@/lib/constants";

interface KycState {
  kycStatus: string;
  docs: Array<{ id: string; kind: string; status: string; createdAt: string; rejectionReason: string | null }>;
}

/** Compression client (WebP, max 1200px) avant upload — économise la data mobile. */
async function compressImage(file: File, maxSize = 1200): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

export default function AccountView() {
  const { user, loading, refresh, logout } = useSession();
  const qc = useQueryClient();
  const kyc = useQuery({ queryKey: ["kyc"], queryFn: () => apiGet<KycState>("/api/me/kyc"), enabled: Boolean(user) });
  const [idKind, setIdKind] = useState("ID_CARD");
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idInput = useRef<HTMLInputElement>(null);
  const selfieInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/connexion", { replace: true });
  }, [loading, user]);

  async function handleFile(file: File | undefined, setter: (url: string) => void) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop lourd (max 10 Mo).");
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setter(dataUrl);
      toast.success("Document prêt. Vérifiez la lisibilité avant d'envoyer.");
    } catch {
      toast.error("Impossible de lire ce fichier image.");
    }
  }

  async function submitKyc() {
    if (!idUrl || !selfieUrl) {
      toast.error("Joignez votre pièce d'identité ET votre selfie.");
      return;
    }
    setSubmitting(true);
    try {
      const upload = async (dataUrl: string, folder: string) => {
        const res = await fetch("/api/uploads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, folder }) });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        return json.data.url as string;
      };
      const [idStored, selfieStored] = await Promise.all([upload(idUrl, "kyc"), upload(selfieUrl, "kyc")]);
      await apiSend("/api/me/kyc", "POST", { idKind, idUrl: idStored, selfieUrl: selfieStored });
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["kyc"] })]);
      setIdUrl(null); setSelfieUrl(null);
      toast.success("Documents envoyés ! Réponse sous 24 h ouvrées.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Envoi impossible");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <PublicHeader />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 pb-28">
        <button onClick={() => navigate("/")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Retour
        </button>

        {/* Profil */}
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
              <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary">
                {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold">{user.fullName}</h1>
              <p className="text-sm text-muted-foreground">{user.phone ?? user.email}</p>
              <div className="mt-1.5"><KycBadge status={user.kycStatus} /></div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {user.roles.map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2.5 text-sm">
                <User className="size-4 text-primary" aria-hidden />
                <span className="font-medium">{label(r)}</span>
                {r === user.activeRole && <span className="ml-auto text-xs font-semibold text-primary">actif</span>}
              </div>
            ))}
          </div>
        </section>

        {/* KYC */}
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> Vérification d&apos;identité
            </h2>
            <KycBadge status={user.kycStatus} />
          </div>
          {user.kycStatus === "VERIFIED" ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" /> Votre identité est vérifiée : badge « Vérifié » activé sur vos offres et votre profil.
            </p>
          ) : user.kycStatus === "PENDING" ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4 text-amber-600" /> Documents reçus — vérification en cours par notre équipe (sous 24 h ouvrées).
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Obligatoire pour <strong>publier des offres</strong> et <strong>retirer de l&apos;argent</strong>. Vos documents sont chiffrés et consultables uniquement par l&apos;équipe de conformité.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type de pièce</Label>
                  <Select value={idKind} onValueChange={setIdKind}>
                    <SelectTrigger aria-label="Type de pièce d'identité"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ID_CARD">CNI / carte d&apos;identité</SelectItem>
                      <SelectItem value="PASSPORT">Passeport</SelectItem>
                      <SelectItem value="DRIVER_LICENSE">Permis de conduire</SelectItem>
                    </SelectContent>
                  </Select>
                  <input ref={idInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0], setIdUrl)} />
                  <button onClick={() => idInput.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-secondary/50">
                    {idUrl ? <img src={idUrl} alt="Aperçu pièce d'identité" className="h-full w-full rounded-xl object-cover" /> : (<><IdCard className="size-6" /> Photographier ma pièce</>)}
                  </button>
                </div>
                <div className="space-y-2">
                  <Label>Selfie</Label>
                  <input ref={selfieInput} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => handleFile(e.target.files?.[0], setSelfieUrl)} />
                  <button onClick={() => selfieInput.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-secondary/50">
                    {selfieUrl ? <img src={selfieUrl} alt="Aperçu selfie" className="h-full w-full rounded-xl object-cover" /> : (<><Camera className="size-6" /> Prendre un selfie</>)}
                  </button>
                </div>
              </div>
              <Button className="mt-4 w-full" onClick={submitKyc} disabled={submitting || !idUrl || !selfieUrl}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : "Envoyer pour vérification"}
              </Button>
            </>
          )}
          {kyc.data?.docs.some((d) => d.status === "REJECTED") && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              {kyc.data.docs.find((d) => d.status === "REJECTED")?.rejectionReason ?? "Vos documents précédents ont été refusés."}
            </p>
          )}
        </section>

        {/* Sécurité */}
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg font-bold">Sécurité</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sessions protégées par cookie signé (httpOnly). Les actions sensibles (retraits) exigent un code OTP.</p>
          <Button variant="outline" className="mt-4" onClick={async () => { await logout(); navigate("/"); }}>
            <LogOut className="size-4" /> Se déconnecter
          </Button>
        </section>
      </div>
      <PublicTabBar />
    </>
  );
}
