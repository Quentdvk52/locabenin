# DEPLOYMENT.md — Checklist de mise en production LocaBénin

## 1. Architecture cible

| Composant | Sandbox (actuel) | Production recommandée |
|---|---|---|
| Frontend + API | Next.js 16 mono-route (SPA + routeur hash) | Next.js sur **Vercel** — routes App Router natives (mapping : `docs/ROUTES.md` § B) |
| Base de données | SQLite + Prisma, contrôle d'accès applicatif | **Supabase PostgreSQL** + RLS (mapping : `docs/DATABASE.md`) |
| Fichiers/médias | `public/uploads` local | **Supabase Storage** (bucket privé KYC + bucket public images) |
| Paiements | `PaymentProvider` mock (simulateur) | **FedaPay** (implémenter l'interface — aucune autre modification) |
| Emails | Canal journalisé | **Resend** |
| SMS / WhatsApp | Canaux journalisés | **Africa's Talking** (SMS) + **Meta Cloud API** (WhatsApp) |
| Temps réel | socket.io mini-service :3003 | Supabase Realtime ou socket.io sur serveur Node persistant |
| Cron | — | **Vercel Cron** : facturation abonnements quotidienne + rappels J-7/J-3/J-1 + masquage impayés |

## 2. Variables d'environnement de production

Copier `.env.example` → configurer sur Vercel (toutes obligatoires sauf mention « optionnel ») :

- `DATABASE_URL` — chaîne Supabase PostgreSQL (pooler : port 6543 en serverless).
- `SESSION_SECRET` — ≥ 32 caractères aléatoires (`head -c 32 /dev/urandom | base64`).
- `PAYMENT_WEBHOOK_SECRET` — secret partagé HMAC des webhooks.
- `PAYMENT_PROVIDER=fedapay` + `FEDAPAY_PUBLIC_KEY` / `FEDAPAY_SECRET_KEY` / `FEDAPAY_WEBHOOK_SECRET` (à connecter quand décidé).
- `RESEND_API_KEY`, `RESEND_FROM` (optionnel en démo, requis pour les emails réels).
- `AT_USERNAME` / `AT_API_KEY`, `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` (SMS/WhatsApp réels).
- `NEXT_PUBLIC_APP_NAME`.

**Règle absolue** : aucun secret dans le code ou Git ; rotation possible de `SESSION_SECRET` invalide toutes les sessions (déconnexion générale).

## 3. Checklist de mise en ligne

### Base de données
- [ ] Créer le projet Supabase ; importer le schéma (Prisma `provider = "postgresql"` + `prisma db push`, ou SQL : `docs/DATABASE.md`).
- [ ] Activer **RLS sur toutes les tables** ; traduire chaque garde applicative en policy (matrice dans `docs/DATABASE.md`).
- [ ] Créer les buckets Storage : `media` (public), `kyc` (privé, URLs signées 5 min).
- [ ] Migrer les données de démo si souhaité (sinon seed production = géo + tarifs + admin uniquement).

### Paiements (quand l'agrégateur sera connecté)
- [ ] Compte FedaPay live validé (KYC entreprise) ; clés live dans Vercel.
- [ ] URL webhook : `https://<domaine>/api/webhooks/payment/fedapay` ; secret configuré des deux côtés.
- [ ] Test bout-en-bout : initiation MTN MoMo → webhook signé → ledger équilibré → quittance PDF.
- [ ] Test d'idempotence : rejouer un webhook → aucune double écriture (`PaymentEvent`).

### Emails / SMS
- [ ] Resend : domaine `locabenin.bj` vérifié (SPF + DKIM + DMARC).
- [ ] Africa's Talking : expéditeur validé ; Meta WhatsApp : numéro business vérifié.

### Sécurité
- [ ] En-têtes actifs : CSP stricte, HSTS, X-Frame-Options DENY, Referrer-Policy (déjà en `next.config.ts` — vérifier avec securityheaders.com).
- [ ] HTTPS forcé ; cookies `secure` automatiques en production (déjà géré).
- [ ] Sentry (ou équivalent) branché sur `/api` + client.
- [ ] Sauvegardes Supabase quotidiennes activées ; test de restauration effectué.
- [ ] Rate limits : passer le limiteur mémoire sur Upstash Redis (multi-instance).

### SEO & performance
- [ ] Migrer les vues vers les routes App Router natives (`docs/ROUTES.md` § B) — URLs shareables + rendu serveur.
- [ ] Sitemap.xml + robots.txt générés depuis `/api/public/cities`.
- [ ] Images : domaine Storage autorisé dans `next.config.ts` ; formats WebP/AVIF servis.
- [ ] Vérifier LCP < 2,5 s (PageSpeed mobile Cotonou 4G simulée).

### Juridique (Bénin)
- [ ] **APDPIP** : déclaration de traitement des données personnelles (loi n° 2017-20 portant code du numérique en République du Bénin — autorité : APDPIP). Données traitées : identité, téléphone, KYC (pièce + selfie), transactions.
- [ ] CGU + Politique de confidentialité : remplacer la version démo (`#/a-propos`) par les textes validés par un conseil juridique.
- [ ] **Valeur probante de la signature électronique** : faire valider le dispositif (canvas + SHA-256 horodaté + audit) ; envisager un prestataire de signature qualifiée si besoin.
- [ ] Mentions des tarifs et des commissions (½ mois de loyer, 25 % locataire / 25 % propriétaire) visibles avant toute transaction.
- [ ] Statut de l'entité opératrice (SARL) + compte bancaire dédié pour les fonds séquestrés (séquestre locatif).

## 4. Reprise / runbook

| Scénario | Procédure |
|---|---|
| Redéploiement | `vercel --prod` ; vérifier `/api/health` (doit répondre `{"ok":true,"db":"up"}`) |
| Restauration BDD | Supabase → backups PITR ; rejouer uniquement si corruption ; le ledger est append-only (aucune correction silencieuse : passer par une écriture de régularisation) |
| Rotation SESSION_SECRET | Variable à jour → redeploy → toutes les sessions invalidées (prévenir les utilisateurs) |
| Agrégateur en panne | Les initiations échouent proprement (message utilisateur) ; aucun argent ne bouge sans webhook vérifié |
| Litige paiement | Statut `DISPUTED` (machine à états) → investigation via `#/admin/paiements` + `#/admin/audit` |

## 5. Recette finale pré-mise en production

- [ ] `bun run lint` → 0 erreur ; `bunx tsc --noEmit` → 0 erreur ; `bun test` → 33/33.
- [ ] Parcours critique testé sur mobile réel : inscription OTP → recherche → visite → candidature → bail → paiement d'entrée (mock) → quittance PDF.
- [ ] Paiement abonnement → offre visible ; expiration simulée → offre masquée ; re-paiement → visible.
- [ ] Lien démarcheur → clic → inscription locataire → bail → commissions 25 %/25 % créditées → fenêtre anti-fraude → validation admin.
- [ ] Retrait : KYC requis, OTP, approbation admin, ledger équilibré.
