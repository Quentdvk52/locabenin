"use client";

// ============================================================
// LocaBénin — Pages « confiance » publiques
// • securite          : paiement séquestre & protection des fonds
// • arnaques          : 8 règles concrètes anti-arnaque
// • devenir-demarcheur: programme + commissions + QR de partage
// • a-propos          : CGU & confidentialité (démo)
// • villes            : annuaire des villes avec compteurs
// ============================================================

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BadgeCheck, Ban, Banknote, BriefcaseBusiness,
  Copy, FileCheck2, FileText, HandCoins, Landmark, LifeBuoy, Link2, MapPin,
  MessageCircle, QrCode, Search, Share2, ShieldCheck, Smartphone, FileWarning,
  UserRound, UserCheck, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/client/session";
import { navigate } from "@/lib/client/router";
import { toast } from "sonner";
import SiteFooter from "./components/SiteFooter";

interface City {
  id: string;
  name: string;
  slug: string;
  count: number;
}

const AGENT_SIGNUP = "/connexion?mode=register&role=AGENT";
const WHATSAPP_NUMBER = "2290197000000";

const META: Record<string, { title: string; subtitle: string }> = {
  securite: {
    title: "Sécurité des paiements",
    subtitle: "Votre argent passe par un séquestre Mobile Money : il n'est libéré au propriétaire qu'après la signature du bail. Jamais de paiement hors plateforme.",
  },
  arnaques: {
    title: "Comment éviter les arnaques",
    subtitle: "La grande majorité des locations se passent bien. Ces règles simples vous protègent des rares fraudeurs — apprenez à les reconnaître en une minute.",
  },
  "devenir-demarcheur": {
    title: "Devenir démarcheur et gagner avec LocaBénin",
    subtitle: "Vous connaissez votre quartier ? Partagez les offres de la plateforme et touchez 25 % d'un mois de loyer à chaque location réussie. Sans capital, sans engagement.",
  },
  "a-propos": {
    title: "Conditions générales & confidentialité",
    subtitle: "L'essentiel de nos conditions d'utilisation et de notre politique de confidentialité, écrit simplement.",
  },
  villes: {
    title: "Louer au Bénin, ville par ville",
    subtitle: "Explorez les offres disponibles dans les principales villes du pays et trouvez le logement qui vous correspond.",
  },
};

export default function StaticPageView({ slug }: { slug: string }) {
  const meta = META[slug] ?? META["a-propos"];

  useEffect(() => {
    document.title = `${meta.title} | LocaBénin`;
    return () => { document.title = "LocaBénin — Location immobilière au Bénin : maisons, appartements meublés, bureaux"; };
  }, [meta.title]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Hero court */}
      <header className="border-b bg-secondary/50">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">LocaBénin</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-4xl">{meta.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{meta.subtitle}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 pb-28 md:pb-12">
        {slug === "securite" && <SecuritePage />}
        {slug === "arnaques" && <ArnaquesPage />}
        {slug === "devenir-demarcheur" && <DemarcheurPage />}
        {slug === "a-propos" && <AProposPage />}
        {slug === "villes" && <VillesPage />}
      </main>

      <SiteFooter />
    </div>
  );
}

// ============================================================
// Blocs réutilisables
// ============================================================

function TrustPoint({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-sm font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function RuleCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border bg-card p-5 shadow-soft">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground" aria-hidden>
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-sm font-bold sm:text-base">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function NumberedSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b pb-5 last:border-b-0">
      <h3 className="flex items-baseline gap-2.5 font-display text-base font-bold">
        <span className="text-primary" aria-hidden>{n}.</span> {title}
      </h3>
      <div className="mt-2 space-y-2 pl-6 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function StepCard({ icon: Icon, step, title, children }: { icon: typeof ShieldCheck; step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border bg-card p-5 shadow-soft">
      <span className="absolute right-4 top-4 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{step}</span>
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5.5" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-base font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

// ============================================================
// /securite — Sécurité des paiements
// ============================================================

function SecuritePage() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-primary/5 p-6 ring-1 ring-primary/15">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <LockIcon /> Le paiement séquestre, comment ça marche ?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Quand vous payez une caution, un loyer ou une réservation sur LocaBénin, votre argent ne va pas
          directement au propriétaire. Il est conservé par notre prestataire de paiement Mobile Money, puis
          libéré au bon moment. Résultat : personne ne peut disparaître avec votre argent.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <StepCard icon={Smartphone} step="Étape 1" title="Vous payez par Mobile Money">
            MTN MoMo, Moov Money ou Celtiis Cash — le montant exact est affiché avant validation, jamais modifié après coup.
          </StepCard>
          <StepCard icon={Banknote} step="Étape 2" title="Les fonds sont bloqués en séquestre">
            Votre argent est conservé par la plateforme pendant la finalisation : signature du bail électronique et confirmation de l&apos;entrée.
          </StepCard>
          <StepCard icon={FileCheck2} step="Étape 3" title="Le propriétaire est payé, vous recevez vos documents">
            À la validation, les fonds sont virés au propriétaire et votre quittance PDF est générée automatiquement, archivée dans votre coffre-fort.
          </StepCard>
        </div>
      </section>

      <section aria-labelledby="confiance-title">
        <h2 id="confiance-title" className="font-display text-lg font-bold">6 raisons de payer en confiance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TrustPoint icon={ShieldCheck} title="Fonds en séquestre">
            Chaque paiement est retenu jusqu&apos;à la signature du bail. En cas de problème déclaré avant validation, vous êtes remboursé.
          </TrustPoint>
          <TrustPoint icon={FileCheck2} title="Quittances automatiques">
            Une quittance PDF officielle est émise après chaque paiement : loyer, caution, réservation. Fini les reçus manuscrits contestables.
          </TrustPoint>
          <TrustPoint icon={BadgeCheck} title="Propriétaires vérifiés (KYC)">
            Les propriétaires vérifient leur identité (pièce officielle + selfie) avant de publier. Les profils vérifiés portent le badge « Vérifié ».
          </TrustPoint>
          <TrustPoint icon={Ban} title="Jamais de paiement hors plateforme">
            Tout argent versé en espèces ou via un numéro personnel est hors de notre protection. Un propriétaire qui exige un paiement direct est un signal d&apos;alerte : signalez-le.
          </TrustPoint>
          <TrustPoint icon={FileText} title="Bail électronique signé en ligne">
            Le contrat de location conforme est signé électroniquement par les deux parties et archivé. Vos droits ne dépendent plus d&apos;une promesse verbale.
          </TrustPoint>
          <TrustPoint icon={LifeBuoy} title="Support réactif & signalement">
            Une équipe examine chaque signalement et arbitre les litiges. Le bouton « Signaler » est présent sur chaque annonce, sans condition.
          </TrustPoint>
        </div>
      </section>

      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-destructive">
          <TriangleAlert className="size-5" aria-hidden /> Le seul vrai danger : payer en dehors de LocaBénin
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Personne chez LocaBénin ne vous demandera jamais un versement Mobile Money sur un numéro personnel,
          ni une avance « pour réserver la visite ». Si cela vous arrive, n&apos;envoyez rien et signalez
          immédiatement l&apos;annonce. Les échanges dans la messagerie intégrée nous permettent de vous protéger.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => navigate("/recherche")}>Chercher un logement <ArrowRight className="ml-1.5 size-4" aria-hidden /></Button>
          <Button variant="outline" asChild>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" aria-hidden /> Poser une question au support
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

function LockIcon() {
  return <ShieldCheck className="size-5 text-primary" aria-hidden />;
}

// ============================================================
// /arnaques — Éviter les arnaques
// ============================================================

function ArnaquesPage() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <RuleCard n={1} title="Ne payez jamais en direct">
          Aucun paiement en espèces, aucun transfert vers un numéro Mobile Money personnel, aucune « avance de visite ». Sur LocaBénin, tout passe par la plateforme et est protégé par le séquestre.
        </RuleCard>
        <RuleCard n={2} title="Privilégiez les propriétaires vérifiés">
          Le badge « Vérifié » signifie que l&apos;identité du bailleur a été contrôlée (pièce officielle + selfie). C&apos;est le premier filtre anti-fraude, sans coût pour vous.
        </RuleCard>
        <RuleCard n={3} title="Visitez avant de verser quoi que ce soit">
          Demandez une visite via la plateforme, en présentiel ou en visite vidéo en direct. Refuser systématiquement une visite est le signe le plus fréquent d&apos;une annonce fictive.
        </RuleCard>
        <RuleCard n={4} title="Un prix trop bas est un signal, pas une aubaine">
          Un 3 chambres-salon à 40 000 FCFA à Cotonou ? Comparez avec les offres similaires du même quartier. Les fraudeurs attirent avec des prix invraisemblables puis pressent de payer « vite ».
        </RuleCard>
        <RuleCard n={5} title="Méfiez-vous de l'urgence artificielle">
          « Trois personnes veulent payer ce soir, envoyez la caution maintenant » : la pression est une technique classique. Un vrai propriétaire accepte que vous suiviez le processus normal — visite, candidature, bail.
        </RuleCard>
        <RuleCard n={6} title="Restez dans la messagerie intégrée">
          Les conversations sur LocaBénin sont conservées et servent de preuve en cas de litige. Un contact qui vous pousse immédiatement vers WhatsApp ou un appel pour conclure cherche souvent à sortir du cadre.
        </RuleCard>
        <RuleCard n={7} title="Vérifiez la cohérence de l'annonce">
          Photos de luxe pour un loyer modeste, localisation floue, propriétaire « à l'étranger » : recoupez les informations. Le calculateur « coût total à l'entrée » de chaque fiche doit correspondre à ce que le propriétaire vous annonce.
        </RuleCard>
        <RuleCard n={8} title="Signalez en un clic">
          Sur chaque fiche, le bouton « Signaler cette annonce » alerte notre équipe de modération (arnaque, fausse annonce, doublon…). Chaque signalement est traité et l&apos;annonce retirée si nécessaire.
        </RuleCard>
      </div>

      <section className="rounded-2xl bg-primary/5 p-6 ring-1 ring-primary/15">
        <h2 className="font-display text-lg font-bold">Vous avez un doute sur une annonce ?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          N&apos;envoyez aucun paiement et dites-le-nous. Notre équipe examine chaque signalement sous 24 h ouvrées ;
          en cas de fraude confirmée, l&apos;annonce est retirée et le compte banni.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => navigate("/securite")}>
            <ShieldCheck className="mr-2 size-4" aria-hidden /> Voir comment nos paiements vous protègent
          </Button>
          <Button variant="outline" asChild>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour LocaBénin, je souhaite signaler une annonce suspecte.")}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" aria-hidden /> Signaler via WhatsApp
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// /devenir-demarcheur — Programme démarcheur
// ============================================================

function DemarcheurPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/#${AGENT_SIGNUP}`;
    setShareUrl(url);
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#064e3b", light: "#ffffff" } }))
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, []);

  const shareText = "Rejoins-moi sur LocaBénin : partage des offres de location et gagne 25 % d'un mois de loyer à chaque location réussie. Inscription gratuite :";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Lien copié — partagez-le avec vos contacts !");
    } catch {
      toast.error("Copie impossible sur cet appareil.");
    }
  }

  return (
    <div className="space-y-10">
      {/* Exemple chiffré */}
      <section className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 p-6 shadow-lift sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-amber-950 sm:text-xl">
          <HandCoins className="size-6" aria-hidden /> 25 % + 25 % : la commission, en clair
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-950/90">
          Quand une location aboutit grâce à votre lien, le locataire et le propriétaire versent chacun 25 % d&apos;un
          mois de loyer — soit ½ mois au total. Exemple concret :
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Loyer mensuel du logement", value: "150 000 F" },
            { label: "Commission totale (½ mois)", value: "75 000 F" },
            { label: "Part locataire (25 % d'un mois)", value: "37 500 F" },
            { label: "Part propriétaire (25 % d'un mois)", value: "37 500 F" },
          ].map((b, i) => (
            <div key={b.label} className={i === 0 ? "rounded-xl bg-amber-950/10 p-3" : "rounded-xl bg-amber-950 p-3 text-amber-50"}>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{b.label}</p>
              <p className="mt-1 font-display text-lg font-extrabold">{b.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium text-amber-950/80">
          Votre rémunération de démarcheur correspond à la part collectée auprès des deux parties pour les locations attribuées à votre lien.
        </p>
      </section>

      {/* Comment ça marche */}
      <section aria-labelledby="agent-steps-title">
        <h2 id="agent-steps-title" className="font-display text-lg font-bold">Comment ça marche ?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <StepCard icon={UserRound} step="1 · Gratuit" title="Créez votre compte démarcheur">
            Inscription en deux minutes avec votre numéro de téléphone. Aucun frais d&apos;entrée, aucun abonnement, aucun engagement.
          </StepCard>
          <StepCard icon={Share2} step="2 · Partagez" title="Partagez les offres du catalogue">
            Chaque offre vous fournit un lien unique et un QR code. Partagez-les dans vos groupes WhatsApp, sur vos affiches, en boutique.
          </StepCard>
          <StepCard icon={BadgeCheck} step="3 · Encaissez" title="Gagnez à chaque location réussie">
            Le locataire qui clique et conclut est attribué à votre lien. Vos commissions arrivent dans votre portefeuille, retirable par Mobile Money.
          </StepCard>
        </div>
      </section>

      {/* Pour qui ? */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display text-base font-bold"><UserCheck className="size-5 text-primary" aria-hidden /> Fait pour vous si…</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>• Vous connaissez des quartiers, des bailleurs ou des nouveaux arrivants.</li>
            <li>• Vous animez des groupes de quartier ou d&apos;entraide sur WhatsApp.</li>
            <li>• Vous cherchez un complément de revenu flexible, sans stock ni capital.</li>
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display text-base font-bold"><FileWarning className="size-5 text-amber-600" aria-hidden /> Les règles du jeu</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>• Vous ne manipulez jamais l&apos;argent du locataire : tout passe par la plateforme.</li>
            <li>• La commission n&apos;est due qu&apos;après une location réellement conclue.</li>
            <li>• Le respect des annonces et des locataires conditionne votre compte.</li>
          </ul>
        </div>
      </section>

      {/* QR + partage + CTA */}
      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <QrCode className="size-5 text-primary" aria-hidden /> Commencez dès aujourd&apos;hui
        </h2>
        <div className="mt-5 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2 rounded-2xl border bg-secondary/50 p-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code d'inscription démarcheur" width={140} height={140} className="rounded-lg" />
            ) : (
              <div className="grid size-[140px] place-items-center rounded-lg bg-secondary text-muted-foreground"><QrCode className="size-8" aria-hidden /></div>
            )}
            <p className="text-center text-[11px] font-medium text-muted-foreground">Scannez pour créer<br />votre compte</p>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Partagez le programme autour de vous : le lien d&apos;inscription ouvre directement le formulaire
              avec le rôle « Démarcheur » présélectionné.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 size-4" aria-hidden /> Partager sur WhatsApp
                </a>
              </Button>
              <Button variant="outline" onClick={() => void copyLink()}>
                <Copy className="mr-2 size-4" aria-hidden /> Copier mon lien
              </Button>
              <Button variant="outline" asChild>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">
                  <Link2 className="mr-2 size-4" aria-hidden /> Facebook
                </a>
              </Button>
            </div>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate(AGENT_SIGNUP)}>
              Créer mon compte démarcheur <ArrowRight className="ml-1.5 size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// /a-propos — CGU + confidentialité
// ============================================================

function AProposPage() {
  return (
    <div className="space-y-10">
      <section aria-labelledby="cgu-title">
        <h2 id="cgu-title" className="font-display text-xl font-bold">Conditions générales d&apos;utilisation</h2>
        <div className="mt-4 space-y-4">
          <NumberedSection n={1} title="Objet">
            <p>LocaBénin est une plateforme qui met en relation des propriétaires, des locataires et des démarcheurs pour la location de biens immobiliers au Bénin. LocaBénin n&apos;est pas propriétaire des biens publiés et n&apos;est pas partie aux contrats de bail.</p>
          </NumberedSection>
          <NumberedSection n={2} title="Comptes et inscription">
            <p>L&apos;inscription se fait par numéro de téléphone avec vérification par code. Certaines fonctionnalités (publier, candidater, réserver) exigent la vérification d&apos;identité (KYC). Chaque utilisateur est responsable de la confidentialité de son compte.</p>
          </NumberedSection>
          <NumberedSection n={3} title="Offres et abonnement">
            <p>La publication d&apos;offres est soumise à un abonnement mensuel par catégorie (logements vides, meublés, bureaux). Les offres sont modérées et peuvent être suspendues en cas de non-paiement, de contenu inexact ou de signalement avéré.</p>
          </NumberedSection>
          <NumberedSection n={4} title="Paiements">
            <p>Les paiements (cautions, loyers, réservations) transitent par la plateforme via un prestataire Mobile Money et sont conservés en séquestre jusqu&apos;à la validation de l&apos;entrée. Une quittance est émise pour chaque paiement réussi.</p>
          </NumberedSection>
          <NumberedSection n={5} title="Commissions de démarcheur">
            <p>Lorsqu&apos;une offre est pourvue via un démarcheur, une commission de ½ mois de loyer s&apos;applique, partagée entre le locataire (25 % d&apos;un mois) et le propriétaire (25 % d&apos;un mois). Le démarcheur ne manipule jamais les fonds des utilisateurs.</p>
          </NumberedSection>
          <NumberedSection n={6} title="Responsabilités">
            <p>Les informations des annonces sont fournies par les propriétaires. En cas de litige entre utilisateurs, LocaBénin facilite la médiation sur la base des échanges et paiements effectués sur la plateforme, sans se substituer aux tribunaux compétents.</p>
          </NumberedSection>
        </div>
      </section>

      <section aria-labelledby="conf-title">
        <h2 id="conf-title" className="font-display text-xl font-bold">Politique de confidentialité</h2>
        <div className="mt-4 space-y-4">
          <NumberedSection n={1} title="Données collectées">
            <p>Nom, numéro de téléphone, éventuellement adresse e-mail, documents KYC (pièce d&apos;identité, selfie), contenus que vous publiez et historique des paiements effectués sur la plateforme.</p>
          </NumberedSection>
          <NumberedSection n={2} title="Utilisation">
            <p>Vos données servent à faire fonctionner le service : vérification d&apos;identité, mise en relation, paiements, quittances, notifications et amélioration de la sécurité (détection des fraudes).</p>
          </NumberedSection>
          <NumberedSection n={3} title="Partage">
            <p>Nos prestataires strictement nécessaires (paiements Mobile Money, hébergement, envoi de SMS) accèdent aux données requises pour leur mission. Nous ne vendons jamais vos données personnelles.</p>
          </NumberedSection>
          <NumberedSection n={4} title="Conservation">
            <p>Les documents comptables et quittances sont conservés selon les durées légales béninoises. Vous pouvez demander la suppression de votre compte ; les données nécessaires aux litiges en cours sont conservées jusqu&apos;à leur résolution.</p>
          </NumberedSection>
          <NumberedSection n={5} title="Vos droits">
            <p>Accès, rectification et suppression : écrivez à contact@locabenin.bj ou contactez le support WhatsApp. Une réponse vous est apportée sous 30 jours.</p>
          </NumberedSection>
        </div>
      </section>

      <p className="rounded-2xl border border-dashed bg-secondary/60 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Note :</strong> ce document est une version de démonstration
        rédigée pour la plateforme LocaBénin. Il doit être relu et validé par un juriste avant toute mise en
        production commerciale.
      </p>
    </div>
  );
}

// ============================================================
// /villes — Annuaire des villes
// ============================================================

function VillesPage() {
  const { data: cities, isLoading } = useQuery({
    queryKey: ["public-cities"],
    queryFn: () => apiGet<City[]>("/api/public/cities"),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="grid gap-3 sm:grid-cols-2">
        {(cities ?? []).map((c) => (
          <li key={c.id}>
            <button
              onClick={() => navigate(`/recherche?demoCity=${c.slug}`)}
              className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
              aria-label={`${c.count} offres à ${c.name}`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-bold">{c.name}</span>
                <span className="block text-sm text-muted-foreground">{c.count} offre{c.count > 1 ? "s" : ""} disponible{c.count > 1 ? "s" : ""}</span>
              </span>
              <Search className="size-4.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {(cities ?? []).length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Landmark className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune ville à afficher pour le moment — les offres publiées alimentent automatiquement cette page.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/recherche")}>
            <BriefcaseBusiness className="mr-2 size-4" aria-hidden /> Voir toutes les offres
          </Button>
        </div>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Vous ne trouvez pas votre commune ? De nouvelles offres sont publiées chaque jour à Cotonou, Porto-Novo,
        Abomey-Calavi, Parakou et dans tout le Bénin — utilisez la recherche libre et activez les alertes.
      </p>
    </div>
  );
}
