# LIVRAISON.md — Recette finale LocaBénin (Phase 9)

**Date de recette :** 1ᵉʳ novembre 2026 · **Environnement :** sandbox local (Next.js 16 dev + SQLite/Prisma + mini-service socket.io :3003 + simulateur de paiement mock)

Ce document clôt la phase 9 (audit & recette). Il enregistre les preuves d'exécution de chaque parcours critique, les résultats de l'audit de sécurité et les correctifs appliqués lors de la recette.

---

## 1. Parcours vérifiés au navigateur (agent-browser, 2 sessions simultanées)

| # | Parcours | Résultat | Preuves |
|---|---|---|---|
| 1 | Accueil public | ✅ | En-tête, recherche par onglets (Louer/Meublé/Bureau), villes populaires avec compteurs (9 Cotonou, 3 Abomey-Calavi…), dernières offres avec carrousels et favoris |
| 2 | Recherche + filtres | ✅ | `#/recherche?type=APARTMENT` → 10 cartes ; panneaux mot-clé, type, caractéristiques, budget, période, localisation, équipements, tri |
| 3 | Fiche offre | ✅ | Galerie 7 photos, tarification, description, équipements, règlement, carte Leaflet (position approximative), avis, bloc « Paiement protégé », offres similaires, actions (favori, visite, réservation, partage, signalement) |
| 4 | Authentification OTP | ✅ | Saisie `+229 01 97 00 00 04` (avec espaces) → code démo affiché → vérification → redirection automatique vers l'espace du rôle actif |
| 5 | Tableau de bord locataire | ✅ | Bail actif BAIL-DEMO001, prochain loyer avec compte à rebours, échéancier 5 lignes, paiements récents, réservations, favoris |
| 6 | Paiement de loyer E2E | ✅ | Dialogue méthode (MTN MoMo/Moov/Celtiis/Carte) → simulateur → confirmation 55 000 FCFA → référence `PAY-MVYE0DZ3-8046` → écran succès + lien quittance PDF → échéancier et KPI mis à jour instantanément (« Payée le 1 novembre 2026 ») |
| 7 | Espace propriétaire | ✅ | 8 KPIs (revenus, loyers attendus/retard, occupation, offres actives…), bannière facture d'abonnement 15 000 FCFA avec action « Payer maintenant » |
| 8 | Espace démarcheur | ✅ | 6 KPIs, règle de commission affichée (25 % + 25 %), badges Bronze/Argent/Or avec paliers 0/3/10 |
| 9 | Back-office admin | ✅ | 10 sections ; vue d'ensemble : KPIs, graphiques 14 j (paiements, inscriptions), carte intégrité ledger **ÉQUILIBRÉ** (Σ débits 585 000 = Σ crédits 585 000 FCFA) |
| 10 | Modération + audit | ✅ | Offre « Cour de 3 logements — Sèmè-Podji » approuvée → publiée ; écriture d'audit immuable tracée (acteur, avant PENDING_REVIEW → après PUBLISHED) |
| 11 | Messagerie temps réel | ✅ | Session A (Kossi) conversation ouverte ; session B (Rachid) envoie un message ; A le reçoit **sans rechargement** via socket.io (room `conv:{id}`) |

## 2. Audit de sécurité

| Contrôle | Résultat |
|---|---|
| Accès non authentifié aux API protégées (10 endpoints testés) | ✅ 401 partout (`admin/*`, `owner/*`, `leases`, `payouts`, `conversations`, `payments/history`) |
| Gardes de rôle | ✅ 11/11 routes admin avec `requireAdmin()` ; espaces gardés côté client + côté API |
| IDOR | ✅ `leases/[id]` : accès limité aux parties (+ admin) ; `conversations/[id]` : participation vérifiée ; QR démarcheur anti-IDOR |
| Sessions | ✅ cookies `httpOnly`, `sameSite=lax`, `secure` en production, signature HMAC-SHA256 |
| Paiements | ✅ `payerId` toujours posé côté serveur (jamais depuis le client) ; webhook idempotent (`PaymentEvent`, rejeu testé) |
| Rate limiting | ✅ observé en conditions réelles : 429 après 3 envois OTP / 10 min (IP + destination) |
| Uploads | ✅ magic bytes vérifiés (pas confiance au Content-Type), limites 6 Mo image / 40 Mo vidéo |
| XSS | ✅ 0 `eval`, 0 innerHTML utilisateur ; 3 `dangerouslySetInnerHTML` sûrs (JSON-LD `JSON.stringify` + thème shadcn) |
| Ledger | ✅ partie double réconciliée en temps réel (admin) ; écritures immuables avec clés d'idempotence |
| Audit admin | ✅ journal horodaté immuable avec acteur, entité, delta avant/après |

## 3. Correctifs appliqués pendant la recette

1. **Normalisation du téléphone** (`src/lib/utils.ts` → `normalizePhone`) : les saisies avec espaces/tirets/points (« +229 01 97 00 00 04 ») étaient rejetées par la validation Zod. Corrigé **côté serveur** (preprocess Zod dans `send-otp` et `verify-otp`) **et côté client** (AuthView) — un utilisateur réel tape souvent son numéro avec des espaces.
2. **Mise à jour des compteurs de tests** dans `docs/DECISIONS.md` et `docs/DEPLOYMENT.md` (33 → 54 tests unitaires).

## 4. Qualité statique

- `eslint .` → 0 erreur · `tsc --noEmit` (strict) → 0 erreur · `bun test` → **54/54** (finance FCFA entier, signatures webhooks FedaPay, mapping d'événements, idempotence)

## 5. Limites connues du bac à sable (non bloquantes, documentées)

- Le simulateur de paiement (`PAYMENT_PROVIDER=mock`) est actif : le bouton « Simuler un échec » et les codes de confirmation s'affichent à l'écran. Il se désactive seul dès que `PAYMENT_PROVIDER=fedapay` est configuré.
- Les SMS/WhatsApp/emails sont des canaux journalisés (le code OTP s'affiche en note démo) ; les canaux réels se branchent dans `src/lib/notifications.ts` sans toucher au reste.
- Le rate limiter est en mémoire : redémarrer le serveur purge les compteurs (multi-instance → Upstash Redis, voir `docs/DEPLOYMENT.md`).
- Les processus dev du bac à sable sont recyclés entre les sessions : relancer `bun run dev` + le mini-service (`mini-services/chat-service`) si besoin.

## 6. Prochaine étape métier

Connexion de l'agrégateur réel : voir `docs/FEDAPAY.md` (implémentation déjà prête — interface `PaymentProvider`, webhook signé HMAC tolérance 300 s, idempotence) et la checklist de mise en production `docs/DEPLOYMENT.md` § 3.
