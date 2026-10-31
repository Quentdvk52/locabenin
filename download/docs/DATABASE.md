# DATABASE.md — Modèle de données

SQLite (sandbox, Prisma) → cible PostgreSQL/Supabase. Schéma complet : `prisma/schema.prisma` (46 modèles). Montants : entiers FCFA. Énumérations : String + validation Zod (SQLite sans enums) — en PostgreSQL, les convertir en vrais `enum`.

## Vue d'ensemble par domaine

```
Utilisateurs   User · UserRole · KycDocument · OtpCode
Géographie     Department · Commune · Area           (12 / 77 / quartiers)
Biens          Property · Listing · ListingMedia · DepositOption · Amenity · ListingAmenity · CalendarBlock
Découverte     Favorite · SavedSearch · Visit · Application
Location       Lease · RentSchedule · Booking
Argent         Payment · PaymentEvent · LedgerAccount · LedgerEntry · Payout
Abonnements    CategoryPricing · SubscriptionInvoice
Affiliation    AffiliateLink · AffiliateClick · AffiliateAttribution · Commission
Communication  Conversation · ConversationParticipant · Message · Announcement · Notification · PushSubscription
Suivi          MaintenanceTicket · TicketUpdate · Review · Report
Système        AuditLog · AdminSetting
```

## Contraintes d'intégrité clés

| Table | Contrainte |
|---|---|
| User | `phone` / `email` UNIQUE |
| Listing | `reference` UNIQUE ; index `(status, genre)`, `(status, type)`, `(category, status)`, `rentAmount`, `areaId`, `ownerId`, `(isFeatured, status)` |
| ListingMedia | index `(listingId, position)` |
| Favorite | PK composite `(userId, listingId)` |
| Lease | `reference` UNIQUE ; index `(ownerId, status)`, `(tenantId, status)` ; `bookingId` UNIQUE (1‑1) |
| RentSchedule | index `(leaseId, dueDate)`, `status` |
| Payment | `reference` UNIQUE, `providerRef` UNIQUE ; index `status`, `leaseId` |
| PaymentEvent | `eventId` UNIQUE → **idempotence des webhooks** |
| LedgerEntry | `idempotencyKey` UNIQUE → **aucune double écriture** |
| LedgerAccount | `code` UNIQUE (ex. `WALLET:OWNER:cuid`, `PLATFORM:CASH`, `PLATFORM:REVENUE`, `PLATFORM:PAYOUTS`) |
| SubscriptionInvoice | UNIQUE `(ownerId, periodStart)` |
| AffiliateLink | `code` UNIQUE, UNIQUE `(listingId, agentId)` |
| AffiliateAttribution | `visitorId` UNIQUE (dernier clic = upsert) |
| Commission | index `(agentId, status)`, `paymentId` |
| Review | UNIQUE `(leaseId, authorId)` |
| OtpCode | index `(destination, purpose)` |

## Ledger en partie double — comptes et flux

Comptes : `PLATFORM:CASH` (actif encaissements), `PLATFORM:PAYOUTS` (sorties), `PLATFORM:REVENUE` (abonnements), `WALLET:OWNER:{id}`, `WALLET:AGENT:{id}`. Les soldes sont **dérivés** (Σ crédits − Σ débits pour les passifs) — aucun champ solde mutable.

| Flux | Débit | Crédit |
|---|---|---|
| Paiement d'entrée / loyer / réservation | `PLATFORM:CASH` | `WALLET:OWNER` |
| Commission démarcheur (25 %+25 %) | `WALLET:OWNER` + `PLATFORM:CASH` | `WALLET:AGENT` |
| Abonnement | `PLATFORM:CASH` | `PLATFORM:REVENUE` |
| Retrait | `WALLET:*` | `PLATFORM:PAYOUTS` |

Invariant vérifié à chaque transaction (Σ débits = Σ crédits, sinon rejet) + réconciliation globale (`reconcileLedger`) exposée dans le back-office.

## Machines à états principales

- **Payment** : `INITIATED → PENDING → SUCCESS | FAILED → REFUNDED | DISPUTED` (aucune régression depuis un état final ; webhook en retard ignoré proprement).
- **Listing** : `DRAFT → PENDING_REVIEW → PUBLISHED ⇄ SUSPENDED_OWNER | SUSPENDED_UNPAID → ARCHIVED` (+ `RESERVED`, `RENTED`).
- **Lease** : `ACTIVE → NOTICE_GIVEN → TERMINATED | EXPIRED`.
- **RentSchedule** : `PENDING → PARTIAL | PAID | LATE | WAIVED` (LATE évalué à la lecture).
- **Commission** : `PENDING_VALIDATION → VALIDATED → PAID | CANCELLED`.
- **Payout** : `OTP_PENDING → REQUESTED → APPROVED → PROCESSING → PAID | REJECTED`.
- **Booking** : `PENDING_PAYMENT → CONFIRMED → COMPLETED | CANCELLED`.
- **KYC** : user `NONE → PENDING → VERIFIED | REJECTED`.

## Migration Supabase (production)

1. `prisma migrate` vers PostgreSQL (les String d'énum → `CREATE TYPE … AS ENUM`).
2. Storage : bucket `uploads` (public) + bucket `kyc` (privé, URLs signées 5 min) ; remplacer `src/lib/uploads.ts`.
3. Auth : remplacer la session HMAC par Supabase Auth (OTP téléphone natif) ; `User.id` = `auth.users.id`.
4. **RLS** — politiques de référence (une par domaine) :

```sql
-- Offres : lecture publique des visibles, écriture par le propriétaire
CREATE POLICY "listing_read" ON "Listing" FOR SELECT
  USING (status IN ('PUBLISHED','RESERVED','RENTED') OR owner_id = auth.uid() OR is_admin());
CREATE POLICY "listing_write" ON "Listing" FOR ALL
  USING (owner_id = auth.uid());
-- Baux : parties uniquement
CREATE POLICY "lease_read" ON "Lease" FOR SELECT USING (owner_id = auth.uid() OR tenant_id = auth.uid());
-- Favoris : propriétaire du favori
CREATE POLICY "fav_all" ON "Favorite" FOR ALL USING (user_id = auth.uid());
-- Ledger : lecture admin, écriture service_role uniquement (aucun policy INSERT côté client)
-- Messages : participants uniquement
CREATE POLICY "msg_read" ON "Message" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "ConversationParticipant" p
          WHERE p.conversation_id = conversation_id AND p.user_id = auth.uid()));
-- Audit : lecture admin ; AdminSetting : lecture publique, écriture admin.
```

5. Vercel Cron : `ensureBillingCycle` quotidien (rappels + masquage) + réconciliation ledger + purge OTP expirés.
6. Sauvegardes : Supabase PITR activé.
