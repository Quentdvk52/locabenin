# LocaBénin — Plateforme de location immobilière au Bénin

SaaS complet de mise en relation locative : **propriétaires**, **locataires**, **démarcheurs** et **administration**. Construit avec Next.js 16 (App Router), TypeScript strict, Tailwind CSS 4, shadcn/ui, Prisma/SQLite (sandbox) et une architecture prête pour la migration Supabase/FedaPay en production.

## Démarrage rapide

```bash
# 1. Dépendances
bun install

# 2. Base de données (SQLite locale)
bun run db:push

# 3. Jeu de données de démonstration (géo Bénin, comptes, 22 offres, bail, ledger)
bun scripts/seed.ts

# 4. Serveur de développement (port 3000)
bun run dev

# 5. Service temps réel messagerie/notifications (port 3003, optionnel mais recommandé)
cd mini-services/chat-service && bun run dev

# 6. Tests de la logique financière
bun test tests/finance.test.ts
```

## Comptes de démonstration

La connexion se fait **par téléphone + OTP** (inscription gratuite). En mode démo, le code à 6 chiffres s'affiche à l'écran (aucun SMS réel).

| Rôle | Téléphone | Nom |
|---|---|---|
| Admin (super) | +2290190000001 | Admin LocaBénin |
| Propriétaire | +2290197000001 | Kossi Adjovi |
| Propriétaire | +2290197000002 | Rosine Ahouansou |
| Locataire | +2290197000003 | Rachid Bio Tchané |
| Locataire | +2290197000004 | Aïcha Gounongbé |
| Démarcheur | +2290197000005 | Sètondji Ahouandjinou |

Le propriétaire Kossi Adjovi cumule aussi le rôle Démarcheur (démonstration du sélecteur de rôle).

## Variables d'environnement

Voir `.env.example`. Résumé :

| Variable | Rôle | Défaut sandbox |
|---|---|---|
| `DATABASE_URL` | SQLite locale | `file:/home/z/my-project/db/custom.db` |
| `SESSION_SECRET` | Signature HMAC des cookies de session | générée dans `.env` |
| `PAYMENT_WEBHOOK_SECRET` | Signature des webhooks de paiement | générée dans `.env` |
| `PAYMENT_PROVIDER` | `mock` (simulateur) · `fedapay` (à brancher) | `mock` |
| `RESEND_API_KEY` | Emails transactionnels (optionnel) | absent → logs |
| `NEXT_PUBLIC_APP_NAME` | Nom affiché | `LocaBénin` |

## Architecture (dossier par dossier)

```
src/
  app/page.tsx          → coquille SPA unique (routeur hash + vues paresseuses)
  app/api/**            → routes API (auth, public, payments, leases, admin…)
  views/                → vues par espace : public, auth, owner, tenant, agent, admin, messaging, account
  components/ui/**      → shadcn/ui (prêt à l'emploi)
  components/shared/**  → ListingCard, KPI, badges, states, form-bits
  components/layout/    → chrome (headers, sidebars, nav basse mobile)
  lib/                  → finance (FCFA pur), auth (OTP/session), ledger (partie double),
                          payments (PaymentProvider + webhooks idempotents), subscription,
                          affiliate, notifications (canaux), settings, pdf (pdfkit), uploads
mini-services/chat-service/  → bus temps réel socket.io (port 3003)
scripts/seed.ts        → jeu de données complet (12 dépt, 77 communes, quartiers…)
tests/                 → tests unitaires financiers (bun test)
docs/                  → DECISIONS.md, ROUTES.md, DATABASE.md, DESIGN_SYSTEM.md, CONVENTIONS.md
```

## Règles métier implémentées (voir docs/DECISIONS.md pour les hypothèses)

- **Location simple** : caution + N mois d'avance + cautions optionnelles libres + (frais démarcheur si affiliable). Contrat PDF + signature électronique (canvas + hash), échéancier de loyer, quittances PDF automatiques, préavis, restitution de caution avec retenues.
- **Meublés** : aucune caution, prix jour/semaine/mois dégressifs, calendrier de disponibilité (réservations + blocages), réservation en ligne avec paiement.
- **Abonnements** : publication payante par MOIS et PAR CATÉGORIE active (Logements vides 5 000 F · Meublés 10 000 F · Bureaux 10 000 F — modifiables sans code). Rappels J-7/J-3/J-1, grâce configurable, masquage automatique des offres impayées, réactivation immédiate au paiement.
- **Démarcheur** : lien/QR par offre, attribution par cookie visiteur (30 j, dernier clic prime), commission ½ mois = 25 % locataire + 25 % propriétaire créditée au paiement d'entrée, période de validation avant retrait, anti-fraude (auto-parrainage bloqué).
- **Argent** : montants en entiers FCFA, ledger en partie double (aucun solde muté directement), webhooks signés + idempotents (`PaymentEvent`), machine à états des paiements (régression impossible), retraits avec KYC + OTP + approbation admin au-delà d'un seuil, réconciliation.
- **Sécurité** : sessions cookies httpOnly signés HMAC, OTP limités (3/10 min) et à tentatives bornées, Zod sur toutes les entrées, contrôle d'accès + anti-IDOR sur chaque route, rate limiting, en-têtes de sécurité, journal d'audit.

## Limitations connues de la sandbox (assumées, documentées)

1. **Paiement** : simulateur Mobile Money (`PAYMENT_PROVIDER=mock`) qui emprunte le VRAI pipeline webhook signé. Branchement FedaPay/KkiaPay : implémenter `PaymentProvider` dans `src/lib/payments.ts`.
2. **SMS/WhatsApp/Email** : canaux abstraits (`NotificationChannel`) qui journalisent. Clés Resend/SMS en production.
3. **Base de données** : SQLite + contrôle d'accès applicatif. Migration Supabase PostgreSQL + RLS décrite dans docs/DATABASE.md.
4. **Routage** : SPA sur `/` (contrainte du bac à sable) via routeur hash ; migration routes App Router décrite dans docs/ROUTES.md.
5. **Notifications temps réel** : socket.io via mini-service ; polling de secours automatique.
6. **Push web / PWA hors ligne** : manifest installable ; service worker complet prévu en production.

## Déploiement production (checklist courte)

1. Supabase : PostgreSQL + Auth + Storage ; importer le schéma (voir docs/DATABASE.md, section migration) et activer RLS.
2. Vercel : variables `.env` de production, `PAYMENT_PROVIDER=fedapay`, domaines images.
3. FedaPay : clés live + URL webhook `https://votre-domaine/api/webhooks/payment/fedapay`.
4. Resend : domaine vérifié (SPF/DKIM).
5. Vérifier : `/api/health`, un paiement test, un retrait test, puis activer les vrais canaux SMS.
