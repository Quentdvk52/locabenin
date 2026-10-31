"use client";

// ============================================================
// LocaBénin — Vérification d'identité (KYC) du propriétaire
// État, rappel des règles (KYC requis pour publier / retirer) et
// documents déposés. Le dépôt lui-même vit sur la page Compte.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Info, FileCheck2, AlertTriangle, UserRound } from "lucide-react";
import { apiGet } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { KycBadge } from "@/components/shared/badges";
import { ErrorState, RowsSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { ViewHeader } from "./components/ViewHeader";
import { formatDateFr } from "./components/helpers";

interface KycData {
  kycStatus: string;
  docs: Array<{ id: string; kind: string; fileUrl: string; status: string; rejectionReason: string | null; createdAt: string }>;
}

const KIND_LABEL: Record<string, string> = {
  ID_CARD: "CNI / carte d'identité",
  PASSPORT: "Passeport",
  DRIVER_LICENSE: "Permis de conduire",
  SELFIE: "Selfie de vérification",
};

export default function OwnerKyc() {
  const kyc = useQuery<KycData>({
    queryKey: ["me", "kyc"],
    queryFn: () => apiGet<KycData>("/api/me/kyc"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <ViewHeader title="Vérification (KYC)" subtitle="Confirmez votre identité pour débloquer toutes les fonctions" icon={ShieldCheck} />

      {kyc.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : kyc.isError || !kyc.data ? (
        <ErrorState message="Impossible de charger votre statut de vérification." onRetry={() => void kyc.refetch()} />
      ) : (
        <>
          <section className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-6 shadow-soft" aria-label="Statut de vérification">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <UserRound className="size-7" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Statut de votre vérification</p>
                <div className="mt-1"><KycBadge status={kyc.data.kycStatus} /></div>
                {kyc.data.kycStatus === "REJECTED" && (
                  <p className="mt-1.5 text-xs text-red-600">
                    Documents refusés — consultez le motif sur la page Compte puis redéposez.
                  </p>
                )}
              </div>
            </div>
            <Button onClick={() => navigate("/compte")} className="h-11 shrink-0">
              <ShieldCheck className="size-4" aria-hidden /> Déposer sur la page Compte
            </Button>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-soft" aria-label="Règles KYC">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Info className="size-4 text-primary" aria-hidden /> Pourquoi vérifier votre identité ?
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span><strong className="text-foreground">Publier des offres</strong> : la vérification renforce la confiance des locataires et met en avant vos annonces.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span><strong className="text-foreground">Retirer vos revenus</strong> : le KYC est obligatoire avant tout retrait Mobile Money (lutte anti-fraude).</span>
              </li>
            </ul>
          </section>

          <section className="space-y-3" aria-label="Documents déposés">
            <h2 className="font-display text-base font-semibold">Mes documents</h2>
            {kyc.data.docs.length === 0 ? (
              <p className="rounded-2xl border border-dashed bg-card/50 px-6 py-8 text-center text-sm text-muted-foreground">
                Aucun document déposé pour l&apos;instant. Rendez-vous sur la <button className="font-semibold text-primary hover:underline" onClick={() => navigate("/compte")}>page Compte</button> pour déposer votre pièce d&apos;identité et un selfie.
              </p>
            ) : (
              <ul className="space-y-2">
                {kyc.data.docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <FileCheck2 className="size-5 text-muted-foreground" aria-hidden />
                      <div>
                        <p className="text-sm font-semibold">{KIND_LABEL[d.kind] ?? d.kind}</p>
                        <p className="text-xs text-muted-foreground">Déposé le {formatDateFr(d.createdAt)}</p>
                        {d.rejectionReason && <p className="text-xs text-red-600">Motif du refus : {d.rejectionReason}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <KycBadge status={d.status === "APPROVED" ? "VERIFIED" : d.status === "REJECTED" ? "REJECTED" : "PENDING"} />
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">Voir</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
