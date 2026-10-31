# CONVENTIONS DE CODE — LocaBénin (document de référence pour tous les modules)

## Stack et règles non négociables
- Next.js 16 App Router, React 19, **TypeScript strict** (zéro `any` injustifié, zéro code mort).
- Tailwind CSS 4 + composants shadcn/ui (déjà dans `src/components/ui` — ne pas recréer).
- Icônes : `lucide-react` uniquement. Animations : `framer-motion`, sobres (150-250 ms).
- Données client : **TanStack Query** (`useQuery`/`useMutation`). Pas de useEffect-fetch manuel quand une query convient.
- Montants : **entiers FCFA**, formatage via `formatFcfa()` (`@/lib/finance`). JAMAIS de flottants.
- **Français intégral** dans l'UI (labels via `label()` de `@/lib/constants`). Aucun lorem ipsum.
- Mobile-first : navigation basse mobile, zones tactiles ≥ 44 px, `inputMode="numeric"` pour montants/téléphones.
- Dark mode : classes sémantiques (`bg-card`, `text-muted-foreground`, `bg-primary/10`…). Jamais de gris brut `text-gray-500` ni de bleu/indigo.
- Accessibilité : `aria-label` sur boutons icônes, focus visible, `role`/`aria-current` sur navigations.

## Architecture single-page (contrainte sandbox)
- UNE seule route Next (`src/app/page.tsx`) = coquille. Les vues sont des composants dans `src/views/**`, affichées par routeur hash (`#/proprietaire/biens`).
- Routeur : `useRoute()` (segments + query), `navigate("/chemin")`, `buildSearchUrl()` — depuis `@/lib/client/router`.
- Session : `useSession()` → `{ user, loading, refresh, switchRole, logout }` ; `apiGet`/`apiSend` depuis `@/lib/client/session`.
- Chaque espace a un `XxxRouter` (`src/views/<espace>/<Espace>Router.tsx`) qui reçoit `route` (string hash) et sous-route selon les segments internes.

## Fichiers partagés — NE PAS MODIFIER
`src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/**`, `src/components/layout/chrome.tsx`, `src/components/shared/**`, `src/components/ui/**`, `prisma/schema.prisma`, `package.json`. Si uneShared manquante est indispensable : créer un composant LOCAL dans son dossier de vue (ex. `src/views/owner/components/…`), jamais modifier le fichier partagé.

## API — conventions serveur
- Réponses : `{ ok: true, data }` ou `{ ok: false, error }` — via `ok()` / `fail()` / `handle()` de `@/lib/api`.
- Toute route : `export async function GET(req: NextRequest, ctx: { params: Promise<{id:string}> })` — **params est une Promise** (Next 16) : `const { id } = await ctx.params;`
- Garde d'accès : `requireUser()`, `requireRole("OWNER")`, `requireAdmin()`. Anti-IDOR : vérifier `ownerId === user.id` (ou appartenance) sur CHAQUE ressource. Exemple : `assertListingOwnership(listingId, user.id)`.
- Validation Zod obligatoire de tout input : `parseBody(req, schema)` / `parseQuery(req, schema)`.
- Rate limiting : `rateLimit()` de `@/lib/rate-limit` sur tout endpoint qui écrit.
- Montants recalculés SERVEUR depuis la base, jamais lus depuis le client.
- Prisma : `import { db } from "@/lib/db"`. Énumérations : String + constantes de `@/lib/constants` (SQLite : pas d'enums).
- Notifications : `sendNotification({ userId, type, title, body, linkHash })` de `@/lib/notifications` (in-app + temps réel automatiques).

## Endpoints déjà prêts (à consommer — ne pas recréer)
- `GET /api/public/listings?q&type&feature&genre&min&max&period&dept&commune&area&amenities&sort&cursor&limit&demoCity` → `{ items, nextCursor, total }` (pagination keyset).
- `GET /api/public/listings/:id(?ref=CODE)` → fiche complète + `entryCost` + `commission` + `similar`.
- `GET /api/public/geo` (départements→communes→quartiers), `/api/public/amenities`, `/api/public/cities`.
- `POST /api/public/report` (signalement, auth requis).
- Auth : `POST /api/auth/send-otp {phone}` → `{devCode}` ; `POST /api/auth/verify-otp {phone, code, fullName?, role?}` ; `POST /api/auth/logout`.
- `POST /api/me/switch-role {role}` ; `GET|POST /api/me/favorites` ; `GET|POST|DELETE /api/me/saved-searches` ; `GET|PATCH /api/me/notifications` ; `GET|POST /api/me/kyc` ; `POST /api/conversations` ; `GET /api/conversations` ; `GET|POST /api/conversations/:id/messages`.
- Paiements : `POST /api/payments/initiate` (cf. route pour le discriminatedUnion) → `{ payment, mockConfirmToken }` puis `POST /api/payments/mock-confirm {reference, outcome}` ; `GET /api/payments/status?reference=` ; `GET /api/payments/history`.
- Retraits : `POST /api/payouts {amount, method, destination, role}` ; `GET /api/payouts` ; `PUT /api/payouts?action=send|verify`.
- Abonnement : `GET /api/subscription/summary` ; `GET /api/subscription/categories` ; `GET /api/subscription/invoices`.
- Baux : `POST /api/leases {applicationId, startDate, leaseMonths, allowPartial}` ; `GET /api/leases` ; `GET|POST|PATCH /api/leases/:id` (GET détail, POST signature, PATCH préavis).
- Restitution caution : `POST|PATCH /api/leases/:id/deposit-return`.
- PDF : `GET /api/pdf/quittance/:paymentId`, `GET /api/pdf/contract/:leaseId`, `GET /api/pdf/invoice/:invoiceId`.
- Réservations meublés : `POST /api/bookings {listingId, startDate, endDate, guests}` ; `GET /api/bookings?listingId=`.
- Visites : `POST|GET|PATCH /api/visits`. Candidatures : `POST|GET|PATCH /api/applications`.
- Upload : `POST /api/uploads` (FormData `file` + `kind=IMAGE|VIDEO`) → `{url}`.

## Composants partagés prêts à l'emploi
- `ListingCard` + `ListingCardSkeleton` (`@/components/shared/listing-card`) — carte premium avec carrousel/favori.
- `InfiniteListings` (`@/components/shared/cursor-list`) — fil infini keyset prêt à brancher sur `/api/public/listings`.
- `StatusBadge`, `GenreBadge`, `TypeBadge`, `AgentBadge`, `VerifiedBadge`, `KycBadge` (`@/components/shared/badges`).
- `KpiCard`, `EmptyState`, `ErrorState`, `CardsSkeleton`, `RowsSkeleton`, `KpiSkeleton` (`@/components/shared/states`).
- `MoneyInput`, `WizardStepper`, `Timeline`, `StatRow` (`@/components/shared/form-bits`).
- `PublicHeader`, `PublicTabBar`, `DashboardShell`, `SpaceTabBar`, `Logo`, `ThemeToggle`, `NotificationsBell` (`@/components/layout/chrome`).
- Graphiques : `recharts` (déjà installé). Cartes : `leaflet` (déjà installé, importer CSS `leaflet/dist/leaflet.css` et charger en `dynamic(..., {ssr:false})`).
- Toasts : `toast.success/error` de `sonner`.

## Qualité avant de finir
1. `cd /home/z/my-project && bun run lint` → corriger TOUTES les erreurs de ses propres fichiers.
2. Vérifier `/home/z/my-project/dev.log` (dernières lignes) après une première visite des vues — corriger toute erreur runtime.
3. Aucun `console.log` oublié. Aucun TODO. Aucune chaîne en anglais visible.
