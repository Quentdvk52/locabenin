# ADMIN_GUIDE.md — Guide d'administration LocaBénin

Guide opérationnel de l'arrière-boutique (`#/admin`, rôle ADMIN). Chaque écran correspond à une entrée du menu latéral.

## 1. Vue d'ensemble (`#/admin`)

KPIs temps réel : utilisateurs (total, rôles, +7 jours), offres par statut, paiements du mois par motif, MRR des abonnements, commissions, retraits en attente, signalements ouverts, KYC en attente.

**Intégrité du ledger** : carte « ÉQUILIBRÉ / DÉSÉQUILIBRE » — somme des débits = somme des crédits sur l'ensemble du journal comptable. Tout déséquilibre est un incident critique : investiguer via `#/admin/paiements` (onglet Webhooks → colonne `processingError`).

Graphiques 14 jours : paiements/jour et inscriptions/jour. Les **bannières d'action** cliquables renvoient directement vers les files à traiter (modération, KYC, signalements, retraits).

## 2. Modération des offres (`#/admin/annonces`)

- **Onglet « En attente »** : chaque soumission passe par `PENDING_REVIEW` (décision D3.7 — publication payante = modération à l'entrée). Actions : **Approuver** (→ `PUBLISHED`, date de publication posée), **Refuser** (motif obligatoire → retour `DRAFT`, le propriétaire corrige et resoumet), **Suspendre** (→ `SUSPENDED_OWNER`), **À la une** (toggle `isFeatured`).
- **Onglet « Doublons »** : détection par propriétaire + titre normalisé (minuscules, espaces réduits). Traiter chaque groupe : approuver une seule annonce, refuser les autres.
- Toutes les actions notifient le propriétaire et écrivent au journal d'audit.

## 3. Utilisateurs (`#/admin/utilisateurs`)

Recherche (nom/téléphone, debounced 300 ms), filtres statut/rôle. Actions : **Suspendre** (déconnexion immédiate, conservation des données), **Réactiver**, **Bannir** (motif obligatoire).

Gardes anti-abus :
- Un admin ne peut pas se modifier lui-même.
- Les comptes ADMIN ne sont modifiables que par un **SUPER_ADMIN** (double garde : sous-rôle de l'acteur + protection de la cible SUPER_ADMIN).

Le détail d'un utilisateur (clic sur la ligne) montre ses rôles, son KYC et tous ses compteurs (offres, baux, paiements, commissions, retraits, signalements).

## 4. KYC (`#/admin/kyc`)

File d'attente groupée par utilisateur : pièce d'identité + selfie (vignettes cliquables → zoom plein écran). Décisions :
- **Approuver** → `kycStatus = VERIFIED` (badge « Vérifié » public ; débloque publication des offres et retraits).
- **Refuser** → motif obligatoire, l'utilisateur peut re-téléverser.

## 5. Paiements & webhooks (`#/admin/paiements`)

- Onglet **Transactions** : 50 derniers paiements (référence, payeur, objet bail/réservation/facture, méthode, montant, statut) — filtres statut/motif.
- Onglet **Webhooks** : `PaymentEvent` avec signature vérifiée, date de traitement et erreur éventuelle. L'**idempotence** (par `eventId`) fait qu'un webhook rejoué ne double jamais une écriture.

## 6. Retraits (`#/admin/retraits`)

Demandes de retrait Mobile Money (MTN MoMo / Moov Money / Celtiis Cash) — pré-requis : KYC vérifié + OTP à la demande.
- **Approuver** → `completePayout()` : écriture comptable idempotente (`payout:{id}`), statut `PAID`, notification.
- **Rejeter** → motif + remise en wallet automatique.
- Le seuil d'**auto-approbation** est paramétrable dans `#/admin/parametres` ; en dessous, le paiement est simulé automatiquement (démo).

## 7. Commissions démarcheurs (`#/admin/commissions`)

Cycle de vie : `PENDING_VALIDATION` → (fenêtre anti-fraude paramétrable, ex. 14 jours) → **Valider** → `VALIDATED` → **Payer** (hors plateforme pour l'instant) → `PAID`.
- **Valider** est refusé tant que `validatableAt` n'est pas dépassé (message avec la date exacte).
- **Annuler** : motif obligatoire (fraude détectée), flag `fraudFlag` posé, commission exclue du solde retirable.

## 8. Signalements (`#/admin/signalements`)

Motifs : arnaque, fausse annonce, contenu inapproprié, doublon, autre. Actions :
- **Traiter** : note interne + option « suspendre l'offre » (→ `SUSPENDED_OWNER` + notification propriétaire).
- **Rejeter** : signalement non fondé.

## 9. Paramètres sans code (`#/admin/parametres`)

5 sections à sauvegarde **indépendante** (modifier une seule section ne touche pas les autres) :

| Section | Paramètres |
|---|---|
| Commission démarcheur | % locataire (déf. 25 %), % propriétaire (déf. 25 %), fenêtre anti-fraude (jours) |
| Tarifs d'abonnement | Logements vides 5 000 F/mois · Meublés 10 000 F/mois · Bureaux 10 000 F/mois + jours de grâce |
| Rattachement types → catégorie | Chaque type de bien (appartement, maison, terrain, boutique…) → catégorie d'abonnement. Les meublés sont toujours « Appartements meublés » |
| Seuils de retrait | Montant minimum, montant d'auto-approbation |
| Modération | Publication automatique (sans revue) — déconseillé, désactivé par défaut |

Chaque modification est auditée (acteur, avant/après).

## 10. Audit (`#/admin/audit`)

Journal **immuable** : date, acteur, action (chips cliquables = filtre), entité touchée, métadonnées. Pagination 25/25. Statistiques par action en tête d'écran. À conserver pour toute investigation financière ou litige.

## 11. Géographie (`/api/admin/geo`)

Ajout/suppression de quartiers par commune. La suppression est **refusée (409)** si des offres y sont rattachées — déplacer d'abord les offres.

## 12. Réflexes d'incident

| Symptôme | Vérifier | Action |
|---|---|---|
| Ledger déséquilibré | `#/admin` carte intégrité → `#/admin/paiements` webhooks | Chercher `processingError`, rejouer le webhook concerné (l'idempotence protège) |
| Paiement « Initié » bloqué | Statut + événements | Le client peut réessayer ; l'ancienne référence expire seule |
| Offre visible mais abonnement expiré | `#/admin/annonces` | Les offres impayées au-delà de la grâce passent `SUSPENDED_UNPAID` et disparaissent — sinon vérifier la catégorie rattachée |
| Utilisateur « ne reçoit pas son code » | Rate limit OTP 3/10 min | Attendre la fenêtre ; vérifier `#/admin/audit` |
