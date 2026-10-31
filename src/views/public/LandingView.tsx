"use client";

// ============================================================
// LocaBénin — Landing publique premium
// Hero avec recherche à onglets, villes populaires, fil infini,
// comment ça marche, offres à la une, programme démarcheur,
// tarifs propriétaires, témoignages, FAQ et footer complet.
// ============================================================

import { useMemo, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Search, MapPin, Home, Sofa, BriefcaseBusiness, UserRoundSearch, KeyRound,
  ShieldCheck, Smartphone, FileCheck2, HandCoins, ChevronRight, Quote, Star,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/shared/form-bits";
import { InfiniteListings } from "@/components/shared/cursor-list";
import { LISTING_TYPES, label } from "@/lib/constants";
import { apiGet } from "@/lib/client/session";
import { buildSearchUrl, navigate } from "@/lib/client/router";
import { useGeo } from "./components/FiltersPanel";
import SiteFooter from "./components/SiteFooter";

const HERO_IMAGE = "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/4b7b2137e46d.jpg";

const HOW_IT_WORKS = [
  {
    icon: Home,
    title: "Vous êtes propriétaire",
    text: "Publiez vos logements en quelques minutes avec un abonnement à partir de 5 000 FCFA par mois et par catégorie, quel que soit le nombre d'offres.",
    cta: { label: "Publier une offre", href: "/connexion?mode=register&role=OWNER" },
  },
  {
    icon: UserRoundSearch,
    title: "Vous cherchez un logement",
    text: "Comparez des offres vérifiées, demandez une visite et payez caution, loyers et réservations en ligne par Mobile Money, avec quittance automatique.",
    cta: { label: "Commencer ma recherche", href: "/recherche" },
  },
  {
    icon: BriefcaseBusiness,
    title: "Vous êtes démarcheur",
    text: "Partagez les offres de la plateforme avec vos contacts et touchez 25 % d'un mois de loyer à chaque location réussie, versés dans votre portefeuille.",
    cta: { label: "Devenir démarcheur", href: "/devenir-demarcheur" },
  },
];

const PRICING = [
  { icon: Home, name: "Logements vides", price: 5000, desc: "Appartements, maisons, villas, studios et toutes les autres locations simples." },
  { icon: Sofa, name: "Appartements meublés", price: 10000, desc: "Locations meublées court ou long séjour avec réservation et paiement en ligne." },
  { icon: BriefcaseBusiness, name: "Bureaux", price: 10000, desc: "Bureaux, plateaux et locaux professionnels pour votre activité." },
];

const TESTIMONIALS = [
  {
    text: "J'ai trouvé un 2 chambres-salon à Fidjrossè en trois jours, sans passer par cinq intermédiaires. La caution payée par Mobile Money avec quittance automatique, ça rassure vraiment.",
    name: "Aïcha D.",
    role: "Locataire à Cotonou",
  },
  {
    text: "Je gère quatre maisons depuis Parakou et je reçois chaque loyer directement sur mon portefeuille, avec la notification à l'appui. Fini les déplacements et les rappels au téléphone.",
    name: "Serge K.",
    role: "Propriétaire à Parakou",
  },
  {
    text: "Je partage les offres de mon quartier dans mes groupes WhatsApp. Chaque location réussie me rapporte une commission versée sans tarder. C'est devenu un vrai complément de revenu.",
    name: "Rachidatou A.",
    role: "Démarcheuse à Porto-Novo",
  },
];

const FAQ_ITEMS = [
  {
    q: "Comment fonctionne la caution ?",
    a: "Le montant de la caution est fixé par le propriétaire et affiché clairement sur chaque offre, avant toute décision. Vous la payez via la plateforme en même temps que votre entrée : elle est conservée en séquestre, versée au propriétaire après validation, puis restituée en fin de bail selon les conditions du contrat. La demande de restitution se fait en un clic depuis votre espace locataire.",
  },
  {
    q: "Quels moyens de paiement acceptez-vous ?",
    a: "MTN MoMo, Moov Money, Celtiis Cash et carte bancaire. Tous les paiements — caution, loyers, réservations de meublés et abonnements propriétaires — passent par la plateforme. Après chaque paiement réussi, une quittance PDF est générée automatiquement et archivée dans votre coffre-fort.",
  },
  {
    q: "Pourquoi vérifier mon identité (KYC) ?",
    a: "La vérification d'identité (pièce officielle + selfie) protège toute la communauté : elle bloque les faux comptes et les annonces frauduleuses. Elle est demandée aux propriétaires pour publier, et aux locataires pour candidater ou réserver. Les profils vérifiés portent le badge « Vérifié ».",
  },
  {
    q: "Le contrat de location est-il inclus ?",
    a: "Oui. Dès l'acceptation de votre candidature, un contrat de bail conforme à la loi béninoise est généré électroniquement et signé en ligne par les deux parties. Il est archivé dans votre coffre-fort de documents, avec le calendrier des échéances de loyer.",
  },
  {
    q: "Combien coûtent les frais de démarcheur ?",
    a: "Lorsqu'un logement est proposé via un démarcheur partenaire agréé, une commission égale à ½ mois de loyer s'applique à la mise en relation réussie. Elle est partagée équitablement : 25 % d'un mois payés par le locataire et 25 % d'un mois déduits au propriétaire. Le montant est toujours affiché dans le calculateur « coût total à l'entrée », sans frais caché.",
  },
  {
    q: "Mes paiements sont-ils sécurisés ?",
    a: "Vos fonds transitent par un paiement séquestre : l'argent n'est libéré au propriétaire qu'après la signature du bail et la validation de l'entrée. Ne jamais payer en dehors de la plateforme : tout paiement direct en espèces est hors de notre protection. En cas de doute, signalez l'offre en un clic — notre équipe examine chaque signalement.",
  },
];

interface City {
  id: string;
  name: string;
  slug: string;
  count: number;
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "LocaBénin",
      url: "https://locabenin.bj",
      description:
        "Plateforme de location immobilière au Bénin : logements, meublés et bureaux avec paiement Mobile Money sécurisé et contrats en ligne.",
      areaServed: "BJ",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: "+229 01 97 00 00 00",
        email: "contact@locabenin.bj",
        availableLanguage: ["fr"],
      },
    },
    {
      "@type": "WebSite",
      name: "LocaBénin",
      url: "https://locabenin.bj",
      inLanguage: "fr-BJ",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://locabenin.bj/#/recherche?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function LandingView() {
  const [tab, setTab] = useState("louer");
  const [rentType, setRentType] = useState("APARTMENT");
  const [commune, setCommune] = useState("");
  const [budget, setBudget] = useState<number | "">("");

  const { data: departments } = useGeo();
  const communes = useMemo(() => (departments ?? []).flatMap((d) => d.communes), [departments]);
  const { data: cities, isLoading: citiesLoading } = useQuery({
    queryKey: ["public-cities"],
    queryFn: () => apiGet<City[]>("/api/public/cities"),
    staleTime: 5 * 60_000,
  });

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "meuble") {
      navigate(buildSearchUrl({ genre: "FURNISHED", commune: commune || undefined, max: budget || undefined }));
    } else if (tab === "bureau") {
      navigate(buildSearchUrl({ type: "OFFICE", commune: commune || undefined, max: budget || undefined }));
    } else {
      navigate(buildSearchUrl({ type: rentType, commune: commune || undefined, max: budget || undefined }));
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* SEO : données structurées */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* ================= HERO ================= */}
      <section className="relative flex min-h-[60vh] items-center overflow-hidden" aria-label="Recherche de logement">
        <Image src={HERO_IMAGE} alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/75" aria-hidden />
        <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-14 text-center sm:py-16">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl"
          >
            Trouvez votre logement au Bénin
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
            className="mx-auto mt-3 max-w-2xl text-sm text-white/90 sm:text-base"
          >
            Appartements, maisons, meublés et bureaux vérifiés à Cotonou, Porto-Novo, Calavi et Parakou.
            Visitez, signez et payez en ligne en toute sécurité — jamais d&apos;intermédiaire douteux.
          </motion.p>

          {/* Barre de recherche à onglets */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.16, ease: "easeOut" }}
            className="mx-auto mt-8 max-w-3xl rounded-2xl bg-card p-3 text-left shadow-lift"
          >
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="louer"><Home className="mr-1.5 hidden size-4 sm:inline" aria-hidden />Louer</TabsTrigger>
                <TabsTrigger value="meuble"><Sofa className="mr-1.5 hidden size-4 sm:inline" aria-hidden />Meublé</TabsTrigger>
                <TabsTrigger value="bureau"><BriefcaseBusiness className="mr-1.5 hidden size-4 sm:inline" aria-hidden />Bureau</TabsTrigger>
              </TabsList>

              <form onSubmit={search} className="px-1 pt-4 pb-1" role="search" aria-label="Recherche de logement">
                <TabsContent value="louer" className="mt-0">
                  <div className="grid gap-2 sm:grid-cols-[1.2fr_1.2fr_1fr]">
                    <Select value={rentType} onValueChange={setRentType}>
                      <SelectTrigger aria-label="Type de bien"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LISTING_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <CommuneSelect communes={communes} value={commune} onChange={setCommune} />
                    <MoneyInput value={budget} onChange={(v) => setBudget(v === 0 ? "" : v)} placeholder="Budget max" ariaLabel="Budget maximum en FCFA" />
                  </div>
                </TabsContent>
                <TabsContent value="meuble" className="mt-0">
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
                    <CommuneSelect communes={communes} value={commune} onChange={setCommune} />
                    <MoneyInput value={budget} onChange={(v) => setBudget(v === 0 ? "" : v)} placeholder="Budget max" ariaLabel="Budget maximum en FCFA" />
                  </div>
                </TabsContent>
                <TabsContent value="bureau" className="mt-0">
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
                    <CommuneSelect communes={communes} value={commune} onChange={setCommune} />
                    <MoneyInput value={budget} onChange={(v) => setBudget(v === 0 ? "" : v)} placeholder="Budget max" ariaLabel="Budget maximum en FCFA" />
                  </div>
                </TabsContent>

                <Button type="submit" size="lg" className="mt-3 w-full sm:w-auto">
                  <Search className="mr-2 size-4.5" aria-hidden /> Rechercher
                </Button>
              </form>
            </Tabs>
          </motion.div>
        </div>
      </section>

      {/* ================= VILLES POPULAIRES ================= */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-10" aria-labelledby="villes-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="villes-title" className="font-display text-xl font-bold sm:text-2xl">Villes populaires</h2>
            <p className="mt-1 text-sm text-muted-foreground">Explorez les communes où l&apos;on loue le plus sur LocaBénin.</p>
          </div>
          <Button variant="ghost" className="hidden shrink-0 sm:inline-flex" onClick={() => navigate("/villes")}>
            Toutes les villes <ChevronRight className="ml-1 size-4" aria-hidden />
          </Button>
        </div>
        <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
          {citiesLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-44 shrink-0 rounded-full md:w-full" />)}
          {(cities ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/recherche?demoCity=${c.slug}`)}
              className="group flex min-h-11 w-44 shrink-0 items-center gap-3 rounded-full border bg-card px-4 py-2.5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift md:w-auto"
              aria-label={`${c.count} offres à ${c.name}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.count} offre{c.count > 1 ? "s" : ""}</span>
              </span>
            </button>
          ))}
          {!citiesLoading && (cities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Les villes s&apos;afficheront dès la publication des premières offres.</p>
          )}
        </div>
      </section>

      {/* ================= DERNIÈRES OFFRES (fil infini) ================= */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-12" aria-labelledby="dernieres-title">
        <h2 id="dernieres-title" className="font-display text-xl font-bold sm:text-2xl">Dernières offres</h2>
        <p className="mt-1 text-sm text-muted-foreground">Les logements ajoutés tout récemment — défilez, la liste se charge au fur et à mesure.</p>
        <div className="mt-5">
          <InfiniteListings
            endpoint="/api/public/listings?limit=12"
            emptyTitle="Aucune offre publiée pour le moment"
            emptyDescription="Revenez très vite : de nouveaux logements sont publiés chaque jour."
            emptyAction={{ label: "Élargir ma recherche", href: "/recherche" }}
          />
        </div>
      </section>

      {/* ================= COMMENT ÇA MARCHE ================= */}
      <section id="comment-ca-marche" className="scroll-mt-20 bg-secondary/50 py-14" aria-labelledby="how-title">
        <div className="mx-auto max-w-7xl px-4">
          <h2 id="how-title" className="text-center font-display text-xl font-bold sm:text-2xl">Comment ça marche ?</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
            Une plateforme unique pour propriétaires, locataires et démarcheurs — transparence sur les frais, paiements protégés.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.title} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <s.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-base font-bold">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                <Button variant="outline" className="mt-4 w-fit" onClick={() => navigate(s.cta.href)}>
                  {s.cta.label} <ChevronRight className="ml-1 size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= OFFRES À LA UNE ================= */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12" aria-labelledby="une-title">
        <h2 id="une-title" className="font-display text-xl font-bold sm:text-2xl">Offres à la une</h2>
        <p className="mt-1 text-sm text-muted-foreground">Une sélection de biens mis en avant par leurs propriétaires.</p>
        <div className="mt-5">
          <InfiniteListings
            endpoint="/api/public/listings?featured=1&limit=4"
            emptyTitle="Aucune offre à la une pour le moment"
            emptyDescription="Les biens mis en avant par les propriétaires apparaîtront ici."
          />
        </div>
      </section>

      {/* ================= BANDEAU DÉMARCHEUR ================= */}
      <section className="mx-auto w-full max-w-7xl px-4" aria-labelledby="agent-title">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 shadow-lift">
          <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-950/15 text-amber-950">
              <HandCoins className="size-7" aria-hidden />
            </span>
            <div className="flex-1">
              <h2 id="agent-title" className="font-display text-lg font-extrabold text-amber-950 sm:text-xl">
                Devenir démarcheur et gagner avec LocaBénin
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-amber-950/90">
                À chaque location réussie via votre lien, la commission de ½ mois de loyer est partagée :
                <strong className="font-bold"> 25 % payés par le locataire + 25 % par le propriétaire</strong>. Vous touchez
                votre part directement dans votre portefeuille, retirable par Mobile Money.
              </p>
            </div>
            <Button size="lg" className="shrink-0 bg-amber-950 text-amber-50 hover:bg-amber-900" onClick={() => navigate("/devenir-demarcheur")}>
              Je me lance <ChevronRight className="ml-1 size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      {/* ================= TARIFS PROPRIÉTAIRES ================= */}
      <section id="tarifs" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-12" aria-labelledby="tarifs-title">
        <h2 id="tarifs-title" className="text-center font-display text-xl font-bold sm:text-2xl">Tarifs propriétaires</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          Un abonnement simple par catégorie — publiez autant d&apos;offres que vous voulez dans vos catégories actives.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PRICING.map((p) => (
            <div key={p.name} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <p.icon className="size-5.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-base font-bold">{p.name}</h3>
              <p className="mt-2 font-display text-2xl font-extrabold text-primary">
                {new Intl.NumberFormat("fr-FR").format(p.price).replace(/\u202F|\u00A0/g, " ")} F
                <span className="text-sm font-semibold text-muted-foreground"> / mois</span>
              </p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Tarif mensuel par catégorie activée, quel que soit le nombre d&apos;offres dans la catégorie. Résiliable à tout moment.
        </p>
      </section>

      {/* ================= TÉMOIGNAGES ================= */}
      <section className="bg-secondary/50 py-14" aria-labelledby="temoignages-title">
        <div className="mx-auto max-w-7xl px-4">
          <h2 id="temoignages-title" className="text-center font-display text-xl font-bold sm:text-2xl">Ils louent avec LocaBénin</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft">
                <Quote className="size-6 text-primary/50" aria-hidden />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">{t.text}</blockquote>
                <div className="mt-4 flex items-center gap-3 border-t pt-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>
                    {t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div>
                    <figcaption className="text-sm font-semibold">{t.name}</figcaption>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <span className="ml-auto flex" aria-label="5 étoiles sur 5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    ))}
                  </span>
                </div>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-14" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-center font-display text-xl font-bold sm:text-2xl">Questions fréquentes</h2>
        <Accordion type="single" collapsible className="mt-6">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-sm font-semibold sm:text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border bg-card p-5 text-center sm:flex-row sm:text-left">
          <ShieldCheck className="size-8 shrink-0 text-primary" aria-hidden />
          <p className="flex-1 text-sm text-muted-foreground">
            En savoir plus sur la protection de votre argent : consultez notre page{" "}
            <button className="font-semibold text-primary underline underline-offset-4" onClick={() => navigate("/securite")}>
              Sécurité des paiements
            </button>
            .
          </p>
          <Button variant="outline" className="shrink-0" onClick={() => navigate("/securite")}>
            <Smartphone className="mr-2 size-4" aria-hidden /> Paiement Mobile Money
          </Button>
        </div>
      </section>

      {/* Espace de respiration avant le footer (barre d'onglets mobile) */}
      <div className="pb-6 md:pb-0" aria-hidden />

      <SiteFooter />
    </div>
  );
}

/** Select des communes (toutes départements confondus) — alimenté par /api/public/geo. */
function CommuneSelect({
  communes, value, onChange,
}: {
  communes: Array<{ id: string; name: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger aria-label="Commune"><SelectValue placeholder="Où ? (commune)" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tout le Bénin</SelectItem>
        {communes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
