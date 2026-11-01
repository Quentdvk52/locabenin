# DECISIONS.md — Journal des décisions techniques et hypothèses

Chaque entrée : contexte → décision → conséquence. Les hypothèses prises par défaut (non contraintes par le cahier des charges) sont marquées **[HYPOTHÈSE]**.

## 1. Infrastructure de la sandbox

### D1.1 — SQLite + Prisma au lieu de Supabase (local)
Le cahier des charges cible Supabase, mais la sandbox n'a ni instance Supabase ni Docker. Décision : Prisma + SQLite pour livrer une base **réellement fonctionnelle** ; le contrôle d'accès est appliqué à 100 % dans les routes serveur (`requireRole` + anti-IDOR systématique). La migration Supabase est décrite table par table dans `docs/DATABASE.md` (mapping RLS).

### D1.2 — Application mono-route + routeur hash
Le bac à sable n'expose que la route `/`. Décision : coquille SPA (`src/app/page.tsx`) + routeur hash (`#/proprietaire/biens`) avec chargement paresseux par vue. Conséquence : URLs partageables mais SEO client ; la migration vers des routes App Router natives est mécanique (`src/views/**` → `src/app/**/page.tsx`, cf. `docs/ROUTES.md`). Le SEO « statique » est porté par les metadata du layout + JSON-LD injecté dans les vues.

### D1.3 — Temps réel via mini-service socket.io (port 3003)
Conformément aux conventions de l'environnement. Le serveur Next émet via un bridge socket.io-client interne (127.0.0.1:3003) ; le navigateur passe par la passerelle (`io("/?XTransformPort=3003")`). Fallback automatique : polling 15 s si le service est absent.

## 2. Paiements (décision utilisateur)

### D2.1 — Agrégateur différé, interface `PaymentProvider` dès maintenant
**Décision utilisateur explicite** : ne pas brancher l'agrégateur tout de suite ; connecter FedaPay/KkiaPay à la fin. Conséquences :
- `PAYMENT_PROVIDER=mock` : simulateur Mobile Money complet (choix opérateur, code de confirmation, succès/échec).
- Le simulateur **emprunte le vrai pipeline** : construction d'un webhook signé HMAC → `/api/webhooks/payment/mock` → vérification de signature → idempotence (`PaymentEvent.eventId` unique) → machine à états (aucune régression SUCCESS→FAILED) → effets métier (ledger, quittance, commissions, réactivation abonnement). Le jour du branchement FedaPay, seules les méthodes `initiate()`/`verifyWebhook()` changent.
- `FedaPayProviderStub` lève une erreur claire si activé sans configuration.

### D2.2 — Montants recalculés serveur
Le client ne transmet jamais un montant : `POST /api/payments/initiate` recompose le total depuis la base (bail, échéance, réservation, facture). Anti-tamper garanti.

## 3. Règles métier

### D3.1 — Rattachement des types aux catégories d'abonnement **[HYPOTHÈSE — demandée par le brief]**
Par défaut : `garage`, `champ`, `terrain`, `propriété (estate)` et `boutique` → catégorie « Logements vides / location simple » (5 000 FCFA/mois). `bureau` → « Bureaux » (10 000 F). Modifiable **sans code** dans Admin → Paramétrage (table `AdminSetting.typeCategoryMapping`). Marqué ici comme demandé.

### D3.2 — Commission sur meublés courte durée **[HYPOTHÈSE — demandée par le brief]**
La commission démarcheur est **désactivée par défaut si la durée < 1 mois** (paramètre admin `commissionMinDurationMonths: 1`). Pour un bail simple, la commission est toujours appliquée (durée ≥ 1 mois par construction).

### D3.3 — Commission ½ mois, base « équivalent mensuel »
Pour un loyer semestriel/trimestriel/bail, la commission est calculée sur l'**équivalent mensuel** (`normalizeToMonthly`) : ex. loyer 1 800 000 F/semestre → 300 000 F/mois → commission 150 000 F (75 000 + 75 000). Parts strictement symétriques (la part locataire sert de base d'arrondi entier).

### D3.4 — Attribution d'affiliation
Cookie visiteur (`lb_vid`, 365 j) + paramètre `?ref=CODE` ; fenêtre **30 jours** (admin-editable) ; **dernier clic prime** (admin-editable : `last_click`/`first_click`). Anti-fraude : auto-parrainage bloqué (démarcheur/propriétaire de l'offre ne peuvent pas générer d'attribution sur leurs propres offres), commissions uniques par paiement (contrainte base + clé d'idempotence ledger), période de validation avant retrait (7 j par défaut).

### D3.5 — Crédit des commissions
Conformément au brief : les **deux parts sont créditées immédiatement** sur le wallet du démarcheur (ledger) à la confirmation du paiement d'entrée, mais restent **non retirable** tant que la période de validation n'est pas écoulée (statut `PENDING_VALIDATION → VALIDATED`). Un retrait ne peut porter que sur des commissions `VALIDATED` (le solde wallet est global, la règle est appliquée par la validation + l'approbation admin).

### D3.6 — Facturation d'abonnement « à la volée »
Pas de cron en sandbox : `ensureBillingCycle(ownerId)` est évaluée au chargement du dashboard propriétaire, des factures et avant les requêtes publiques. Elle crée la facture du mois, émet les rappels J-7/J-3/J-1 (une fois par jalon), passe en `OVERDUE`, masque les offres au-delà de la grâce et réactive au paiement. En production : Vercel Cron quotidien appelant la même fonction (endpoint à ajouter).

### D3.7 — Publication payante = modération à l'entrée
`autoPublishListings: false` par défaut : une offre publiée passe en `PENDING_REVIEW` et n'est visible qu'après approbation admin (file de modération, détection de doublons). Paramétrable sans code.

## 4. Sécurité

### D4.1 — Sessions HMAC stateless
Cookie `lb_session` (httpOnly, SameSite=Lax, secure en prod) signé HMAC-SHA256, 30 j. Le rôle actif vit dans `lb_role` (validé contre les rôles détenus à chaque requête). Migration Supabase Auth décrite dans DATABASE.md.

### D4.2 — OTP
6 chiffres, hash HMAC en base (jamais le code en clair), TTL 5 min, 5 tentatives max, 3 envois/10 min/destination, consommation unique. En sandbox le code est **renvoyé à l'UI** (bannière démo) et loggé — à désactiver en production (canal SMS réel).

### D4.3 — KYC
Upload pièce + selfie (compression client WebP, vérification magic bytes serveur, noms nettoyés), validation manuelle admin (hypothèse recommandée, coût nul), badge « Vérifié ». Production : bucket privé Supabase + URLs signées courtes.

### D4.4 — Signature électronique des contrats
Canvas → PNG → stockage local ; hash SHA-256 horodaté quand les deux parties ont signé ; journal d'audit. **Valeur probante à faire valider juridiquement** (voir livrable « points juridiques »). Option OTP-SMS possible en évolution (paramètre prêt).

### D4.5 — Mots de passe
Inscription OTP-first ; le champ `passwordHash` (scrypt) existe pour une connexion email/mot de passe ultérieure. Pas de secrets dans le code : tout passe par `.env` (fourni en `.env.example`).

## 5. UI/UX

### D5.1 — Design system « Émeraude & Sable »
Primaire vert émeraude profond (confiance/clin d'œil drapeau), accent or-ambre (CTA secondaires, badges), neutres sable chauds, surfaces blanc cassé ; rouge réservé aux erreurs. Contrastes AA, mode sombre complet, grille 8 px, rayons 12-16 px, ombres douces multi-niveaux, animations sobres 150-250 ms avec respect de `prefers-reduced-motion`. Typographie : **Sora** (titres) + **Inter** (texte). Détaillé dans `docs/DESIGN_SYSTEM.md`.

### D5.2 — Montants et dates
`formatFcfa` (entiers, séparateurs fins, « FCFA »), `formatDate` fr-FR fuseau **Africa/Porto-Novo**. Aucun flottant financier dans tout le projet.

### D5.3 — i18n-ready
Libellés centralisés (`src/lib/constants.ts` → `label()`), textes français naturels. Migration `next-intl` (déjà installé) : extraire les dictionnaires sans toucher à la logique.

## 6. Données

### D6.1 — Référentiel géographique
**12 départements + 77 communes officiels** importés au seed (source : liste officielle vérifiée — GéoBénin). Quartiers préchargés pour 13 grandes villes (Cotonou 15, Abomey-Calavi 9, Porto-Novo 8, Parakou 8, etc.). Enrichissement possible par l'admin (route `/api/admin/geo`, refus de suppression si des offres y sont rattachées).

### D6.2 — Médias
Upload direct vers `public/uploads` (sandbox) avec compression client WebP (≤1600 px) + vérification serveur magic bytes + limites (6 Mo image / 40 Mo vidéo). Interface prête pour Supabase Storage (remplacer `src/lib/uploads.ts`).

### D6.3 — Soft delete
`deletedAt` sur `User` et `Listing` (les autres entités critiques sont supprimées en cascade contrôlée). Le ledger, les paiements, l'audit : **immuables** (jamais supprimés).

## 7. Ce qui reste explicitement à brancher (assumé, demandé par le client)

| Élément | État | Effort d'activation |
|---|---|---|
| FedaPay / KkiaPay | Interface prête + simulateur | Implémenter `initiate()` + `verifyWebhook()` (~1 j) |
| SMS/WhatsApp réels | Canaux log | Clés API + 2 classes (~½ j) |
| Resend email | Canal prêt (clé absente) | `RESEND_API_KEY` |
| Supabase PostgreSQL + RLS | Mapping documenté | Migration Prisma + policies (~2-3 j) |
| Routes SEO App Router | Mapping documenté | Déplacer les vues (~1 j) |
| Google OAuth | Bouton présent, désactivé | NextAuth/Supabase provider (~½ j) |
| Push web + SW offline | Manifest installable | VAPID + service worker (~1 j) |
| Vercel Cron facturation | Logique prête (fonction) | Endpoint + cron (~½ j) |

## 8. Phase 9 — Intégration finale & recette (2026-10-31)

### D9.1 — Défauts d'intégration corrigés (conflits entre modules parallèles)
- `constants.ts` : doublons de clés dans `LABELS` supprimés (FURNISHED, OFFICE, PENDING, PAID, REJECTED) — les libellés de catégorie d'abonnement sont portés par les paramètres admin sans code, plus par `LABELS`.
- `conversations` & `tickets` : `Conversation` et `MaintenanceTicket` ne portent pas de relation Prisma vers `Listing` (listingId seul) → titres résolus par une requête complémentaire par lot (même forme de réponse pour les vues).
- `leases` : include `depositOptions` ajouté à la lecture de l'offre (les cautions optionnelles sont reprises du référentiel, pas du snapshot).
- `payouts` : imports `walletBalance`/`walletStatement` rétablis depuis `@/lib/ledger` (source unique de vérité comptable).
- `public/listings` : logique de recherche extraite dans `searchListings()` exportée (l'API et le type `ListingSearchItem` partagent la même source).
- `verify-otp` : garde anti-null après relecture du compte.
- `ListingWizard` : `Promise.all` sur les téléversements (les jobs n'étaient pas attendus).
- `seed.ts` : les 6 meublés ont désormais un `rentAmount`/`rentPeriod` de référence (= `monthlyPrice`).

### D9.2 — Configuration de la sandbox découverte en recette
- `SESSION_SECRET` était absente du `.env` → toute l'auth échouait en 500. Ajoutée (≥ 32 caractères aléatoires) ; `.env.example` fourni.
- La garde du simulateur de paiement testait `PAYMENT_PROVIDER !== "mock"` alors que l'absence de la variable signifiait déjà mock (défaut de `getPaymentProvider()`) → garde inversée (`=== "fedapay"` refuse le simulateur) + `PAYMENT_PROVIDER=mock` posé explicitement.

### D9.3 — Recette navigateur exécutée (agent-browser)
Landing (flux 21 offres, à la une, recherche à onglets) · recherche filtrée partageable · fiche simple (calculateur d'entrée exact : 80 000+160 000+240 000=480 000 F) · fiche meublé (tarifs, carte Leaflet, garde d'auth) · mode sombre · OTP (4 comptes) + rate limit vérifié (429 attendu) · sélecteur multi-rôles · paiement loyer MTN MoMo bout-en-bout → quittance PDF 2 pages → échéancier à jour → **ledger équilibré 440 000 F = 440 000 F** · messagerie (envoi + rafraîchissement) · back-office (KPIs, graphiques, intégrité ledger, modération avec approbation réelle → PUBLISHED + audit `LISTING_APPROVE`, paramétrage sans code) · viewport mobile (barre basse fixe + safe-area).

### D9.4 — Qualité finale
`tsc --noEmit` 0 erreur · `eslint .` 0 erreur · `bun test` 33/33 · `/api/health` `{ok:true,db:"up"}` · données de démonstration re-seedées après correctifs.

## 9. Phase 10 — Branchement FedaPay réel (2026-11-02)

### D10.1 — Contrat API vérifié auprès des sources officielles
Implémentation écrite **à partir de la documentation publique et du code source du SDK officiel `fedapay-node` v1.2.5** (non d'hypothèses) :
- API : `POST {base}/v1/transactions` (montant **entier** XOF, `custom_metadata.reference` = référence `PAY-…` LocaBénin, `callback_url` = `PUBLIC_BASE_URL`) puis `POST {base}/v1/transactions/{id}/token` (caisse hébergée) ; bases `https://api.fedapay.com` (live) / `https://sandbox-api.fedapay.com` ; réponses enveloppées `{"v1/transaction": …}`.
- Webhook : en-tête `X-FEDAPAY-SIGNATURE` au format `t=<unix>,s=<hex>[,s=…]` — signature = **HMAC-SHA256(secret, `"<t>.<corps brut>"`)**, comparaison à constante de temps, tolérance anti-rejeu **300 s** (valeur du SDK, cadre symétrique ajouté pour un horodatage futur).
- Découverte du contrat par le SDK officiel, non par un paquet npm tiers : aucun nouveau paquet ajouté (implémentation maison de `WebhookSignature`, ~60 lignes, testée).

### D10.2 — Architecture inchangée : le provider ne modifie QUE sa classe
`FedaPayProvider` remplace `FedaPayProviderStub` derrière la même interface `PaymentProvider` ; le simulateur `mock` reste le défaut (`PAYMENT_PROVIDER=mock`) et le pipeline webhook/idempotence/ledger/quittances/commissions est **strictement commun** (aucun `if provider === "fedapay"` dans les effets métier ; la seule spécialisation est le parsing du format d'événement natif dans la route webhook via `parseFedapayEvent`). Le jour où KkiaPay est souhaité : même interface.

### D10.3 — Mapping des événements (choix assumés)
- `transaction.approved` **et `transaction.transferred`** → `payment.succeeded` (transféré = client a payé puis fonds arrivés ; l'approbation reste le déclencheur principal, `transferred` n'ajoute aucun effet grâce à la machine à états non-régressive).
- `declined` / `canceled` / `expired` → `payment.failed` ; `refunded` → `payment.refunded` (effet : journalisé, gestion des litiges admin existante).
- `transaction.created` / `updated` / `customer.*` → **réponse 200 `ignored`** sans écriture : évite la désactivation automatique du endpoint après 10 échecs (comportement documenté FedaPay).
- Transactions sans référence `PAY-…` dans `custom_metadata` (fallback `entity.reference` strict) → ignorées : jamais d'effet métier sur une transaction née hors LocaBénin.
- Client FedaPay créé avec `firstname: "Client"`, `lastname: "LocaBénin"` + email/téléphone du payeur (les noms propres ne sont pas exigés par l'API pour encaisser).

### D10.4 — Front-end : redirection vers la caisse hébergée
Quand `initiate` renvoie `checkoutUrl` (provider fedapay), les 3 dialogues de paiement (locataire, propriétaire, public) affichent une étape « Redirection vers FedaPay » avec renvoi automatique (1,6 s) + bouton manuel ; le simulateur ne s'affiche que pour `mock`. La confirmation arrive par webhook ; le statut se rafraîchit à la navigation suivante (historique de paiements). Route `/api/payments/mock-confirm` refuse le simulateur dès que `PAYMENT_PROVIDER=fedapay`.

### D10.5 — Robustesse de la création de transaction
Timeout 15 s sur les deux appels, erreurs réseau/API transformées en `ApiError 502` avec message utilisateur clair (jamais d'exception brute, jamais de détail d'authentification), journal serveur du corps d'erreur tronqué. Échec du lien token : transaction créée reste exploitable (paiement `PENDING`, l'utilisateur peut réessayer).

### D10.6 — Recette environnement de la Phase 10
- `SESSION_SECRET` **perdue lors du recyclage de la sandbox** (`.env` réduit à `DATABASE_URL`) : régénérée et documentée ; `.env.example` créé (absent) avec toutes les variables et la procédure de génération.
- Tests : **21 nouveaux tests** `tests/fedapay.test.ts` (signature valide/altérée/mauvais secret/malformée/anti-rejeu/multi-signatures ; mapping complet des événements ; idempotence de l'eventId ; config) → **54/54** au total. `tsc --noEmit` 0 erreur, `eslint .` 0 erreur.
- Activation à l'arrivée des clés (aucun code) : `FEDAPAY_SECRET_KEY` + `FEDAPAY_ENVIRONMENT` + `FEDAPAY_WEBHOOK_SECRET` + `PUBLIC_BASE_URL` + `PAYMENT_PROVIDER=fedapay`, endpoint `https://<domaine>/api/webhooks/payment/fedapay`.
