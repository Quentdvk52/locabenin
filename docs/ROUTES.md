# ROUTES.md — Arborescence des routes

Deux vues : **A. sandbox actuelle** (SPA mono-route, routeur hash) et **B. cible production** (routes App Router natives, migration mécanique).

## A. Application actuelle (hash routing sur `/`)

### Public (sans connexion)
| Hash | Vue | Contenu |
|---|---|---|
| `#/` | LandingView | Hero + recherche à onglets (Louer/Meublé/Bureau), villes populaires, fil infini, offres à la une, comment ça marche (3 profils), tarifs, témoignages, FAQ, footer |
| `#/recherche` | SearchView | Filtres complets dans l'URL (partageables), compteur live, chips actifs, panneau latéral desktop / tiroir bas mobile, carte Leaflet |
| `#/offres/:id` | ListingDetailView | Galerie plein écran, calculateur « coût total à l'entrée », ligne frais démarcheur si affiliation, carte approximative, profil propriétaire vérifié, contacter/visite/candidature/favori/partager/signaler, réservation (meublés), similaires, JSON-LD |
| `#/villes` | StaticPageView | Villes populaires avec compteurs |
| `#/securite` | StaticPageView | Sécurité des paiements |
| `#/arnaques` | StaticPageView | Éviter les arnaques |
| `#/devenir-demarcheur` | StaticPageView | Programme démarcheur (commission 25 %+25 %) |
| `#/a-propos` | StaticPageView | CGU/Confidentialité (démo) |
| `#/connexion` | AuthView | OTP téléphone (connexion + inscription + choix rôle), Google (prod) |
| `#/messagerie` | MessagingView | Conversations + fil temps réel (socket.io + fallback polling) |
| `#/compte` | AccountView | Profil, rôles, KYC (pièce + selfie), sécurité |

### Espace Propriétaire (rôle OWNER)
| Hash | Vue |
|---|---|
| `#/proprietaire` | Dashboard : KPIs, revenus 6 mois, échéances, alertes abonnement |
| `#/proprietaire/biens` | Liste/gestion offres (publier, suspendre, dupliquer, archiver, toggle démarcheur) |
| `#/proprietaire/biens/nouveau` · `/biens/:id` | Assistant 5 étapes (type/localisation → détails → tarification/cautions → équipements/médias → options/récap) |
| `#/proprietaire/locataires` | Baux, fiches locataires, échéancier, relances, préavis, restitution de caution |
| `#/proprietaire/visites` | Onglets visites (confirmer/refuser/terminer) + candidatures (accepter → créer le bail) |
| `#/proprietaire/finances` | Wallet, retraits, relevé, encaissements, quittances, factures + paiement |
| `#/proprietaire/abonnement` | Catégories actives, total temps réel, factures, grâce/masquage |
| `#/proprietaire/reparations` | Tickets avec photos et suivi |
| `#/proprietaire/annonces` | Annonces groupées (tous / par bien) in-app + SMS/WhatsApp |
| `#/proprietaire/kyc` | État de vérification |

### Espace Locataire (rôle TENANT)
| Hash | Vue |
|---|---|
| `#/locataire` | Dashboard : logement actuel, compte à rebours du loyer, paiements |
| `#/favoris` | Favoris + recherches sauvegardées avec alertes |
| `#/locataire/candidatures` | Candidatures envoyées |
| `#/locataire/bail` | Échéancier, paiement par échéance, paiement d'entrée, signature du contrat, préavis, avis |
| `#/locataire/documents` | Coffre-fort (contrats, quittances, reçus) |
| `#/locataire/reparations` | Tickets |
| `#/locataire/profil` | Profil/KYC |

### Espace Démarcheur (rôle AGENT)
| Hash | Vue |
|---|---|
| `#/demarcheur` | KPIs clics/conversions, badges, ressources WhatsApp copiables |
| `#/demarcheur/catalogue` | Offres affiliables avec commission estimée |
| `#/demarcheur/liens` | Liens + QR + partage WhatsApp/Facebook/SMS |
| `#/demarcheur/commissions` | Suivi des commissions (validation → payée) |
| `#/demarcheur/wallet` | Solde, relevé, retrait Mobile Money (KYC + OTP) |

### Back-office (rôle ADMIN)
| Hash | Vue |
|---|---|
| `#/admin` | Vue d'ensemble : KPIs, graphiques, intégrité du ledger |
| `#/admin/annonces` | Modération (file, toutes, doublons) |
| `#/admin/utilisateurs` | Gestion (suspendre/bannir) |
| `#/admin/kyc` | Validation des documents |
| `#/admin/paiements` | Transactions + événements webhook |
| `#/admin/retraits` | Approbations |
| `#/admin/commissions` | Validation/annulation |
| `#/admin/signalements` | Traitement |
| `#/admin/parametres` | Paramétrage sans code (tarifs, catégories, rattachements, seuils, grâce…) |
| `#/admin/audit` | Journal d'audit |

## API (App Router, toutes sous `/api`)
| Groupe | Endpoints |
|---|---|
| Auth | `POST /auth/send-otp`, `POST /auth/verify-otp`, `POST /auth/logout` |
| Moi | `GET /me/session`, `POST /me/switch-role`, `GET/POST /me/favorites`, `GET/POST/DELETE /me/saved-searches`, `GET/PATCH /me/notifications`, `GET/POST /me/kyc` |
| Public | `GET /public/listings` (filtres + keyset), `GET /public/listings/:id` (+ `?ref=` affiliation), `GET /public/geo`, `/public/amenities`, `/public/cities`, `POST /public/report` |
| Paiements | `POST /payments/initiate`, `POST /payments/mock-confirm`, `GET /payments/status`, `GET /payments/history`, `POST /webhooks/payment/:provider` |
| Retraits | `POST /payouts`, `GET /payouts`, `PUT /payouts?action=send\|verify` |
| Abonnement | `GET /subscription/summary`, `GET /subscription/categories`, `GET /subscription/invoices` |
| Baux | `POST/GET /leases`, `GET/POST/PATCH /leases/:id` (détail/signature/préavis), `POST/PATCH /leases/:id/deposit-return` |
| Meublés | `POST/GET /bookings` |
| Visites / Candidatures | `POST/GET/PATCH /visits`, `POST/GET/PATCH /applications` |
| Transverse | `POST/GET/PATCH /tickets`, `POST /reviews`, `POST/GET /announcements`, `POST /uploads` (+ `PUT` dataURL), `GET/POST /conversations`, `GET/POST /conversations/:id/messages` |
| PDF | `GET /pdf/quittance/:paymentId`, `GET /pdf/contract/:leaseId`, `GET /pdf/invoice/:invoiceId` |
| Propriétaire | `GET /owner/dashboard`, `GET/POST /owner/listings`, `PUT /owner/listings/:id`, `GET /owner/tenants`, `GET /owner/finances`, `GET/POST /owner/properties`, `GET /owner/overview-leads` |
| Démarcheur | `GET /agent` (stats + `?qr=CODE`), `POST /agent` (créer un lien) |
| Admin | `GET /admin/overview`, `GET/PATCH /admin/users(/:id)`, `GET/PATCH /admin/kyc`, `GET/PATCH /admin/listings`, `GET /admin/payments`, `GET/PATCH /admin/payouts`, `GET/PATCH /admin/commissions`, `GET/PATCH /admin/reports`, `GET/PUT /admin/settings`, `GET /admin/audit`, `GET/POST/DELETE /admin/geo` |
| Santé | `GET /health` |

## B. Cible production (App Router natif)

Migration : chaque vue devient une route (les composants restent identiques) :

```
src/app/(public)/page.tsx                    → landing (SSR + ISR 60 s)
src/app/(public)/recherche/page.tsx          → recherche (SPP client, filtres en searchParams)
src/app/(public)/offres/[id]/page.tsx        → fiche (SSR + generateMetadata + JSON-LD + sitemap)
src/app/(public)/villes/[slug]/page.tsx      → SEO par ville (ISR)
src/app/(public)/types/[type]/page.tsx       → SEO « Appartement meublé à Cotonou »
src/app/(public)/(pages)/securite|arnaques|cgu/page.tsx
src/app/connexion/page.tsx
src/app/(owner)/proprietaire/**/page.tsx     → layouts + pages (dashboard, biens, biens/nouveau, biens/[id], locataires, visites, finances, abonnement, reparations, annonces, kyc)
src/app/(tenant)/locataire/**/page.tsx
src/app/(agent)/demarcheur/**/page.tsx
src/app/(admin)/admin/**/page.tsx
src/app/api/**                               → inchangé
```

Le routeur hash (`src/lib/client/router.ts`) est remplacé par `next/navigation` (useRouter/useSearchParams) ; les vues ne changent pas car elles reçoivent déjà leurs paramètres par props.
