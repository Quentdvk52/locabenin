# Tâche C — Espace Locataire & Espace Démarcheur (LocaBénin)

## Fichiers créés

### Espace Locataire — `src/views/tenant/`
| Fichier | Rôle |
|---|---|
| `api.ts` | Helpers partagés : `guardedGet/guardedSend` (401 → /connexion), `mutationError`, `compressImage/uploadPhoto`, types bruts (RawLease, RawSchedule, RawListing, PaymentHistoryItem, PaymentIntent), `pickCurrentLease`, `parseDepositOptions`, `daysUntil`, `toCardData` |
| `components/PaymentDialog.tsx` | Contrat `{ open, onClose, makePayment, onSuccess?, title? }` — choix méthode (MTN/Moov/Celtiis/Carte) → initiate par l'appelant → écran simulateur « Code Mobile Money » (note démo) → POST `/api/payments/mock-confirm` → polling `/api/payments/status` → écran succès (lien quittance `_blank`) / échec (réessayer). Bouton « Simuler un échec » pour la démo |
| `components/SignaturePad.tsx` | Canvas tactile (pointer events), DPR net, effacer, export `toDataURL("image/png")` via onChange |
| `TenantRouter.tsx` | Route `#/locataire` + sous-routes + `#/favoris`, garde session 401 |
| `TenantDashboard.tsx` | Logement actuel (photo/titre/adresse/bail badge), prochain loyer + compte à rebours (rouge <5 j ou LATE) + « Payer mon loyer », échéances, paiements récents, réservations (history purpose BOOKING), favoris récents |
| `TenantLease.tsx` | Sélecteur de bail, échéancier (table, payer par échéance → initiate RENT), paiement d'entrée (déduit d'un payment INITIAL SUCCESS dans l'historique ; aperçu `initialPaymentBreakdown` ; sinon bouton → initiate INITIAL), signature (SignaturePad → POST /api/leases/:id `{signatureDataUrl, party:"TENANT"}`), contrat PDF `_blank`, préavis (confirm → PATCH), avis (étoiles → POST /api/reviews) si TERMINATED/EXPIRED |
| `TenantFavorites.tsx` | Onglets Favoris (ListingCard) / Recherches sauvegardées : lancer la recherche (qs reconstitué depuis filtersJson), toggle alertes (recréation POST + DELETE old), supprimer |
| `TenantApplications.tsx` | Candidatures : badge statut, retirer si PENDING, note bail + lien /locataire/bail si ACCEPTED, « chercher d'autres offres » |
| `TenantDocuments.tsx` | Coffre-fort groupé : contrats (PDF), quittances (quittanceUrl), reçus paiement d'entrée, reçus réservations, factures abonnement N/A + note SHA-256 |
| `TenantTickets.tsx` | Tickets + création (titre/description/priorité/photos compressées → POST /api/uploads → POST /api/tickets), fil de discussion (PATCH body), badges |
| `TenantProfile.tsx` | Résumé session, redirection /compte (KYC), rôles avec activation (POST /api/me/switch-role via useSession), déconnexion |

### Espace Démarcheur — `src/views/agent/` + API
| Fichier | Rôle |
|---|---|
| `src/app/api/agent/route.ts` | **GET** : requireRole("AGENT","ADMIN") — liens (cover, titre, clics réels, commissions par lien), commissions par statut, KPIs (clics, conclus = VALIDATED+PAID, conversion %), `walletBalance("AGENT", id)` (lib ledger), settings. **GET ?qr=CODE** : QR data URL (`qrcode`), anti-IDOR (lien doit appartenir au user), URL reconstruite via x-forwarded-host/proto. **POST {listingId}** : rate limit, anti auto-parrainage (erreur propre), option Démarcheur exigée pour création, `getOrCreateLink` (lib affiliate), commission estimée |
| `api.ts` | Types AgentData/AgentLinkItem/AgentCommissionItem/PayoutData + mêmes gardes 401 |
| `AgentRouter.tsx` | Routes /demarcheur/*, garde session |
| `AgentDashboard.tsx` | 6 KpiCard, badge Bronze/Argent/Or (0/3/10 locations) avec critères + progression, résumé portefeuille, 3 textes WhatsApp prêts à copier (clipboard + toast) |
| `AgentCatalogue.tsx` | /api/public/listings (3 pages max) filtrées `affiliateEnabled`, ListingCard `showAgentBadge` + bandeau commission estimée, « Obtenir mon lien » / « Voir mon lien », recherche texte + tri prix locaux, note explicative |
| `AgentLinks.tsx` | URL `${origin}/#/offres/{id}?ref={code}`, Copier / WhatsApp / Facebook / SMS, QR (Dialog, serveur), stats par lien (clics, commissions) |
| `AgentCommissions.tsx` | Table-cartes avec parts locataire/propriétaire/total + Timeline mini (Créée → En validation « retirable le … » → Validée → Payée), explication du cycle (X jours, settings) |
| `AgentWallet.tsx` | Solde agentBalance, relevé statements.AGENT (+/−), historique retraits filtrés role AGENT, retrait : POST /api/payouts {role:"AGENT"} → PUT ?action=send (devCode affiché, note démo) → PUT ?action=verify → toast (autoProcessed / en attente admin si > seuil), alerte KYC → /compte |

## Endpoints créés
- `GET /api/agent` (stats + liens + commissions + wallet + settings)
- `GET /api/agent?qr=CODE` (QR data URL, anti-IDOR)
- `POST /api/agent` (création lien d'affiliation)

## Consommation d'APIs existantes (aucune recréée)
payments initiate/status/mock-confirm/history · leases GET + [id] GET/POST/PATCH · payouts GET/POST/PUT · bookings (history BOOKING) · applications GET/PATCH · tickets GET/POST/PATCH · reviews POST · me/favorites · me/saved-searches GET/POST/DELETE · uploads POST · pdf/contract + pdf/quittance · public/listings.

## Points d'attention
- Le toggle d'alertes des recherches sauvegardées utilise POST (recréation) + DELETE faute de PATCH dans l'API fournie.
- Aucun fichier partagé modifié : tout est dans src/views/tenant/**, src/views/agent/**, src/app/api/agent/**.
- Pendant la session, les vues Owner ont été complétées en parallèle par l'agent B — la compilation globale est redevenue possible pour la validation.
