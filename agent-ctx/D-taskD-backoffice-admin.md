# Task D — Back-office admin complet (LocaBénin)

**Agent :** Task D (Admin back-office)
**Statut :** ✅ Terminé — APIs + vues + lint + typecheck OK

## Fichiers créés

### APIs — `src/app/api/admin/`
| Endpoint | Méthodes | Rôle |
|---|---|---|
| `overview/route.ts` | GET | KPIs globaux : users (total/rôles/+7 j), listings par statut, paiements SUCCESS du mois par motif, MRR factures (PAID + DUE/OVERDUE), commissions par statut, retraits en attente, signalements ouverts, KYC PENDING, offres PENDING_REVIEW, `platformRevenue()` + `reconcileLedger()`, graphiques 14 j (paiements/jour, inscriptions/jour) |
| `users/route.ts` | GET, PATCH | Liste filtrable (query/status/role, take 50) ; PATCH suspend/activate/ban — refuse auto-modification, garde hiérarchique (SUPER_ADMIN seul sur comptes ADMIN), notif + audit |
| `users/[id]/route.ts` | GET | Détail : rôles (+subRole), counts (listings, leasesAsOwner/Tenant, payments, commissions, payouts, reports, kyc) |
| `kyc/route.ts` | GET, PATCH | GET ?status=PENDING → groupes user+docs (urls, kind) ; sinon historique (200 derniers). PATCH {userId, decision, reason?} → updateMany PENDING docs + user.kycStatus + notif KYC + audit |
| `listings/route.ts` | GET, PATCH | File PENDING_REVIEW / tous statuts / `?duplicates=1` (groupes ≥2 par ownerId+titre normalisé lowercase-trim) ; PATCH approve(PUBLISHED+publishedAt)/reject(DRAFT+note)/suspend(SUSPENDED_OWNER)/feature/unfeature + notif propriétaire + audit |
| `payments/route.ts` | GET | 50 paiements (payer, objet bail/réservation/facture, breakdown) ; `?events=1` → 20 payment_events (processedAt/processingError) |
| `payouts/route.ts` | GET, PATCH | Liste + seuils settings ; PATCH approve → `completePayout()` (ledger idempotent) / reject → REJECTED+motif+notif+audit |
| `commissions/route.ts` | GET, PATCH | PATCH validate (refusé si `validatableAt` non dépassé — message daté) / cancel (fraudFlag=motif) + notif + audit |
| `reports/route.ts` | GET, PATCH | PATCH resolve (resolution + option `suspendListing` → SUSPENDED_OWNER + notif propriétaire) / dismiss + audit |
| `settings/route.ts` | GET, PUT | GET getSettings()+getCategoryPricing() ; PUT patch partiel (Zod strict) + upsert pricing + audit SETTING_UPDATE |
| `audit/route.ts` | GET | Journal paginé (actor fullName, metaJson parsé) + `?stats=1` counts par action |
| `geo/route.ts` | GET, POST, DELETE | Départements→communes→quartiers (+counts) ; POST quartier (409 si doublon) ; DELETE 409 si offres rattachées, sinon hard delete + audit |
| `helpers.ts` | — | `auditAction()` (AuditLog actorId/action/entityType/entityId/metaJson/ip), `adminSubRole()`, `assertCanManageAdminAccount()`, `rolesOf()`, `normalizeTitle()`, `adminRateLimited()` (60 écritures/min/admin) |

Toutes les routes : `requireAdmin()` + enveloppe `ok()/fail()/handle()` + Zod (`parseBody`/`parseQuery`) + rate limit sur toute écriture.

### Vues — `src/views/admin/`
| Fichier | Contenu |
|---|---|
| `AdminRouter.tsx` | Répartiteur `{ route }` → 10 vues (max-w-7xl) |
| `components/bits.tsx` | `AdminError` (401/403 → « Accès réservé à l'administration »), `PageIntro`, `SectionCard`, `ActionBanner`, `LedgerBadge`, `initials` |
| `AdminOverview.tsx` | 8 KpiCards, bannières d'action cliquables (modération/KYC/signalements/retraits), AreaChart paiements 14 j + BarChart inscriptions 14 j (recharts, couleurs `--chart-*`), carte Intégrité ledger (badge ÉQUILIBRÉ/DÉSÉQUILIBRE + Σ débits/crédits formatFcfa + revenus plateforme) |
| `AdminModeration.tsx` | Onglets En attente/Toutes/Doublons ; cards cover+titre+prix+owner+KYC+date ; Approuver (vert)/Refuser (dialog motif)/Suspendre/À la une toggle ; doublons groupés badge « même propriétaire » + actions inline |
| `AdminUsers.tsx` | Recherche debounced 300 ms + filtres statut/rôle ; table (avatar initiales, rôles badges, KYC, offres, statut) ; menu Suspendre/Réactiver/Bannir via AlertDialog + motif ; détail Dialog (rôles + counts) |
| `AdminKyc.tsx` | File PENDING par user : vignettes cliquables → Dialog zoom plein écran ; Approuver / Refuser (motif obligatoire) ; onglet Historique (table statuts) |
| `AdminPayments.tsx` | Table paiements (référence, date, payeur, objet, méthode, montant formatFcfa, statut) + filtres statut/motif ; onglet Webhooks : payment_events avec signature/processedAt/erreur rouge |
| `AdminPayouts.tsx` | Cards user (rôle badge) + montant + destination + statut ; Approuver (AlertDialog → completePayout) / Rejeter (motif) ; note seuil auto-approbation paramétrable |
| `AdminCommissions.tsx` | Table démarcheur/offre/parts/total/validatableAt ; Valider désactivé avant fin de fenêtre anti-fraude ; Annuler avec motif ; note anti-fraude |
| `AdminReports.tsx` | Cards motif/détails/offre liée/reporter/statut ; Traiter (note + checkbox « suspendre l'offre ») / Rejeter |
| `AdminSettings.tsx` | 5 sections avec sauvegarde partielle indépendante : commission démarcheur, tarifs abonnement (MoneyInput + labels + grâce), mapping type→catégorie (Select), seuils retraits (MoneyInput), switch publication auto ; remontage par `key` serveur (zéro setState-in-effect) |
| `AdminAudit.tsx` | Chips stats par action cliquables + table journal (date, acteur, badge action FR, entité, méta résumée) + pagination take/skip 25 |

## Choix notables
- **Doublons** : normalisation `lowercase + trim + espaces réduits` (helper partagé `normalizeTitle`).
- **users PATCH** : auto-modification interdite pour tous ; comptes ADMIN réservés au SUPER_ADMIN (double garde : subRole acteur + cible SUPER_ADMIN).
- **Reject listing** → retour en `DRAFT` (le propriétaire corrige et resoumet) — décision documentée.
- **Payment↔invoice** : pas de relation Prisma (invoiceId seul) → résolution manuelle par `findMany({ id: { in } })`.
- **Settings** : formulaires réinitialisés par remontage (`key` dérivée des valeurs serveur) au lieu de `useEffect`+setState (conforme règle react-hooks/set-state-in-effect).
- **Geo** : pas de soft delete ; DELETE → 409 explicite avec nombre d'offres rattachées.

## Validation (final)
- `bunx eslint src/views/admin src/app/api/admin` → **0 erreur, 0 warning**.
- `bun run lint` global : les 3 erreurs restantes sont dans des fichiers partagés interdits (`src/components/layout/chrome.tsx` × 2, `src/lib/client/router.ts` × 1) — préexistantes, hors périmètre.
- `bunx tsc --noEmit` → **0 erreur** sur les fichiers admin.
- Page `/` → HTTP 200, compile propre (les erreurs « Module not found » historiques du log correspondent aux états intermédiaires de l'écriture parallèle des fichiers, résorbées).

## Test runtime effectué (curl, session admin)
- Utilisateur admin en base (`+2290190000001`, rôle ADMIN / subRole SUPER_ADMIN) — données uniquement, schéma intact.
- `POST /api/auth/send-otp` → devCode ; `POST /api/auth/verify-otp -c /tmp/admin_cookies.txt` → session ADMIN active.
- GET 200 : `overview`, `users` (+ filtre role), `users/[id]`, `kyc?status=PENDING`, `listings?status=PENDING_REVIEW`, `listings?duplicates=1`, `payments`, `payments?events=1`, `payouts`, `commissions`, `reports`, `settings`, `audit?stats=1`, `audit?take=3`, `geo`.
- Écritures testées : `PUT settings` (partiel, 200) ; `PATCH listings` approve→PUBLISHED, approve dupliqué→400 « déjà publiée », suspend→SUSPENDED_OWNER (état initial restauré en base après test) ; `POST geo` création quartier + `DELETE` suppression (409 impossible non déclenché, offre-count 0) ; audit journalisé à chaque écriture (vérifié via `audit?take=5`).
- Gardes vérifiées : sans session → 401 « Connectez-vous » ; auto-modification → 400 « Vous ne pouvez pas modifier votre propre compte » ; payout inconnu → 404 ; settings % invalide → 400 Zod.
- dev.log : aucune erreur runtime sur `/api/admin/*` (les erreurs présentes concernent `src/lib/affiliate.ts` — fichier partagé hors périmètre).

## Reste éventuel
- Aucun. Les erreurs lint restantes du repo concernent `src/components/layout/chrome.tsx`, `src/lib/client/router.ts`, `src/views/public/components/FiltersPanel.tsx`, `src/views/tenant/components/SignaturePad.tsx` (fichiers partagés — interdits de modification).
