"use client";

// ============================================================
// LocaBénin — Pied de page du site public
// Réutilisé par la landing et les pages statiques (confiance).
// Colle en bas de page : mt-auto dans un conteneur flex min-h-screen.
// ============================================================

import { Landmark, Mail, MessageCircle, MapPin } from "lucide-react";
import { navigate } from "@/lib/client/router";
import { cn } from "@/lib/utils";

const POPULAR_SLUGS: Array<{ name: string; slug: string }> = [
  { name: "Cotonou", slug: "cotonou" },
  { name: "Porto-Novo", slug: "porto-novo" },
  { name: "Abomey-Calavi", slug: "abomey-calavi" },
  { name: "Parakou", slug: "parakou" },
  { name: "Bohicon", slug: "bohicon" },
  { name: "Djougou", slug: "djougou" },
];

function FooterLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => (onClick ? onClick() : navigate(href ?? "/"))}
      className="text-left text-sm text-emerald-100/80 transition-colors hover:text-white hover:underline underline-offset-4"
    >
      {children}
    </button>
  );
}

/** Navigue vers l'accueil puis fait défiler jusqu'à la section demandée. */
export function goSection(id: string) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (typeof window === "undefined") return;
  if (!window.location.hash || window.location.hash === "#/" || window.location.hash.startsWith("#/?")) scroll();
  else {
    navigate("/");
    window.setTimeout(scroll, 400);
  }
}

const WHATSAPP_NUMBER = "2290197000000";

export default function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-auto bg-emerald-950 text-white", className)} aria-label="Pied de page">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* À propos */}
        <nav aria-label="À propos" className="space-y-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-emerald-200">
            <Landmark className="size-4" aria-hidden /> À propos
          </h3>
          <FooterLink onClick={() => goSection("comment-ca-marche")}>Comment ça marche</FooterLink>
          <FooterLink href="/devenir-demarcheur">Devenir démarcheur</FooterLink>
          <FooterLink onClick={() => goSection("tarifs")}>Tarifs propriétaires</FooterLink>
        </nav>

        {/* Découvrir */}
        <nav aria-label="Découvrir" className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-emerald-200">Découvrir</h3>
          <FooterLink href="/villes">Toutes les villes</FooterLink>
          {POPULAR_SLUGS.map((c) => (
            <FooterLink key={c.slug} href={`/recherche?demoCity=${c.slug}`}>
              Location à {c.name}
            </FooterLink>
          ))}
        </nav>

        {/* Aide */}
        <nav aria-label="Aide" className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-emerald-200">Aide</h3>
          <FooterLink href="/securite">Sécurité des paiements</FooterLink>
          <FooterLink href="/arnaques">Éviter les arnaques</FooterLink>
          <FooterLink onClick={() => goSection("faq")}>Questions fréquentes</FooterLink>
        </nav>

        {/* Contact */}
        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-emerald-200">Contact</h3>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-emerald-100/80 transition-colors hover:text-white"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            WhatsApp +229 01 97 00 00 00
          </a>
          <a
            href="mailto:contact@locabenin.bj"
            className="flex items-center gap-2 text-sm text-emerald-100/80 transition-colors hover:text-white"
          >
            <Mail className="size-4 shrink-0" aria-hidden />
            contact@locabenin.bj
          </a>
          <p className="flex items-center gap-2 text-sm text-emerald-100/80">
            <MapPin className="size-4 shrink-0" aria-hidden />
            Cotonou · Porto-Novo · Parakou
          </p>
        </div>
      </div>

      {/* Mentions — respecte la zone sûre mobile au-dessus de la barre d'onglets */}
      <div className="border-t border-emerald-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 pb-[calc(1.25rem+4.5rem)] text-xs text-emerald-100/70 sm:flex-row md:pb-5">
          <p>© 2025 LocaBénin. Tous droits réservés.</p>
          <p className="flex items-center gap-3">
            <FooterLink href="/a-propos">CGU</FooterLink>
            <span aria-hidden>·</span>
            <FooterLink href="/a-propos">Confidentialité</FooterLink>
          </p>
        </div>
      </div>
    </footer>
  );
}
