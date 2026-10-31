# DESIGN_SYSTEM.md — LocaBénin « Émeraude & Sable »

Identité : confiance, chaleur, modernité, ancrage béninois sans clichés. Implémentation : tokens CSS dans `src/app/globals.css` (light + dark), composants shadcn/ui sur-thémés.

## 1. Couleurs (tokens OKLCH)

| Token | Light | Usage |
|---|---|---|
| `--primary` | émeraude profond (`oklch(0.5 0.12 158)` ≈ #0B6B45) | CTA principaux, liens, focus, marque |
| `--primary-foreground` | blanc cassé | texte sur émeraude |
| `--accent` / `--gold` | or-ambre (`oklch(0.83 0.13 80)` ≈ #E9A23B) | CTA secondaires, badges Meublé, highlights |
| `--background` | blanc cassé chaud (sable très clair) | fonds de page |
| `--surface` | sable un ton plus soutenu | zones alternées, cartes KPI |
| `--card` | presque blanc | cartes |
| `--secondary` / `--muted` | sable | fonds secondaires, chips |
| `--destructive` | rouge réservé | erreurs, alertes, loyers en retard |
| Charts | émeraude, ambre, teal, terracotta, prune | graphiques Recharts |

Dark mode : fond vert très sombre désaturé, primaire éclairci (contraste AA maintenu), ambre inchangé. **Interdits** : bleu/indigo, gris froids bruts — toujours passer par les tokens.

## 2. Typographie

- **Titres** : Sora (`font-display`, 600-800) — expressive, géométrique.
- **Texte** : Inter (`font-sans`) — très lisible, `font-feature-settings: "cv11"`.
- Échelle : 12 (caption) · 14 (base mobile) · 15 (titres de cartes) · 16/18 (sous-titres) · 20-24 (titres de page) · 30+ (hero). Interlignage confortable (leading-relaxed sur les descriptions).

## 3. Grille, rayons, ombres

- Grille 8 px (espacements `gap-2/4/6/8`, padding `p-4` ou `p-6`).
- Rayons : `--radius: 12px` (boutons/chips), cartes `rounded-2xl` (16 px), modales `rounded-xl`.
- Ombres utilitaires : `shadow-soft` (repos), `shadow-lift` (hover), `shadow-glow` (focus/CTA) — douces, multi-niveaux, teinte verte.
- Bordures fines `border` (token) ; séparateurs `Separator`.

## 4. Composants signature

- **Carte d'offre** (`ListingCard`) : image 4:3 avec carrousel tactile + points de pagination, bandeau de badges (Meublé or / Location simple émeraude / type / Démarche­ur violet / À la une), favori animé (pulse 250 ms), prix en émeraude gras, caractéristiques (chambres · douches · m²), hover `shadow-lift` + zoom photo léger.
- **Badges** (`badges.tsx`) : statut coloré par sémantique (vert = actif/payé, ambre = attente, rouge = retard/blocage, sable = neutre) ; `VerifiedBadge` avec BadgeCheck.
- **KPI** (`KpiCard`) : icône dans tuile émeraude pâle, valeur `font-display` 24, tendance ±% colorée.
- **Filtres** : chips scrollables (mobile) + panneau latéral sticky (desktop) + tiroir bas (Sheet), compteur live, chips actifs avec croix.
- **Wizard** (`WizardStepper`) : pastilles numérotées reliées, état done/current/pending.
- **Timeline** : rail + points d'état (done/current/pending) pour baux, commissions, tickets.
- **MoneyInput** : formatage milliers live, suffixe FCFA fixe, `inputMode="numeric"`.
- **EmptyState / ErrorState / Skeletons** : illustrés (icône dans tuile), CTA de rattrapage, skeletons partout (cartes, KPI, tableaux).
- **Nav basse mobile** (`PublicTabBar`/`SpaceTabBar`) : 5 items, ≥ 44 px, safe-area iOS, accent émeraude.
- **Toasts** : sonner, position haute, richColors.
- **Stepper de paiement** : choix opérateur (MTN/Moov/Celtiis/Carte) → simulateur Mobile Money → polling statut → écran succès avec quittance PDF.

## 5. Micro-interactions

- Durées 150-250 ms, `ease-out`, apparition `fade-up` au scroll (`whileInView`, once).
- Hover : élévation + zoom image 1.03 max ; press : `scale-95`/`active:scale-90` sur les boutons icônes.
- `prefers-reduced-motion` : animations neutralisées (media query CSS).
- Focus clavier visible partout (`outline-ring/50`).

## 6. Contenu et formats

- Montants : `formatFcfa` → « 150 000 FCFA » (espaces fines) ; prix + période (« / mois »).
- Dates : `formatDate` fr-FR, fuseau Africa/Porto-Novo.
- Ton : rassurant, concret, tutoiement jamais ; messages d'erreur actionnables (« Réessayez », « Connectez-vous pour continuer »).
- Zéro lorem ipsum : tous les textes (landing, FAQ, pages confiance, empty states) sont rédigés pour le contexte béninois.

## 7. Accessibilité

- Contrastes AA minimum (tokens vérifiés light/dark).
- Navigation clavier : focus visible, `InputOTP` accessible, Dialogs Radix (focus trap natif).
- ARIA : `aria-label` sur tous les boutons icônes, `aria-current` sur la navigation, `role="link"` sur les cartes cliquables, alt descriptifs sur les photos.
- Zones tactiles ≥ 44 px ; formulaires avec `inputMode` adapté (tel, numeric) ; labels explicites.

## 8. Photographie

- Ratio constant 4:3 en grille, plein écran en fiche ; `next/image` (WebP/AVIF auto, lazy par défaut, `sizes` responsives) ; fallback icône sur photo absente ; largeur/qualité calibrées réseau mobile.
