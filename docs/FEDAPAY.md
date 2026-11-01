# Guide d'activation FedaPay — LocaBénin

> L'intégration **est déjà codée et testée** (`src/lib/fedapay.ts`, `FedaPayProvider` dans
> `src/lib/payments.ts`, 21 tests unitaires). Aucune modification de code n'est nécessaire :
> tout s'active par variables d'environnement. Durée estimée : **≤ 30 minutes**.

## 1. Ce qui est déjà en place (aucune action)

| Composant | État |
|---|---|
| Création de transaction API v1 (`POST /v1/transactions`, montant entier XOF, `custom_metadata.reference` = référence LocaBénin `PAY-…`) | ✅ codé |
| Lien de caisse hébergée (`POST /v1/transactions/{id}/token`) + redirection automatique depuis les 3 dialogues de paiement | ✅ codé |
| Vérification du webhook `X-FEDAPAY-SIGNATURE` (HMAC-SHA256 `t.s`, tolérance 300 s, conforme SDK officiel) | ✅ codé + testé |
| Traduction des événements (`approved`/`transferred` → succès, `declined`/`canceled`/`expired` → échec, `refunded` → remboursement ; autres → ignorés avec 200) | ✅ codé + testé |
| Pipeline métier commun (idempotence `PaymentEvent`, machine à états non-régressive, ledger partie double, quittances PDF, commissions démarcheur, réactivation abonnement) | ✅ partagé avec le simulateur |
| Sécurité anti-fraude (corps brut signé obligatoire, transactions sans référence `PAY-…` ignorées, rejeux sans double effet) | ✅ codé + testé |

## 2. Côté FedaPay (tableau de bord)

1. Créer / valider le compte marchand : sandbox `https://sandbox.fedapay.com`, production `https://live.fedapay.com` (KYC entreprise requis pour le live).
2. Récupérer la **clé secrète API** : `sk_sandbox_…` (test) ou `sk_live_…` (production).
3. Créer le **webhook** : Workbench → Webhooks → Create.
   - URL : `https://<votre-domaine>/api/webhooks/payment/fedapay`
   - Événements à cocher : `transaction.approved`, `transaction.declined`, `transaction.canceled`, `transaction.expired`, `transaction.refunded`
   - Révéler et copier le **secret du endpoint** (`wh_sandbox_…` / `wh_…`).
4. (Test) Les numéros de test Mobile Money sont fournis dans la doc FedaPay — MTN MoMo / Moov / cartes.

## 3. Variables d'environnement

```bash
PAYMENT_PROVIDER=fedapay
FEDAPAY_SECRET_KEY=sk_sandbox_xxx          # ou sk_live_xxx en production
FEDAPAY_ENVIRONMENT=sandbox                 # puis live
FEDAPAY_WEBHOOK_SECRET=wh_sandbox_xxx       # secret du endpoint (étape 2.3)
PUBLIC_BASE_URL=https://<votre-domaine>     # callback client après paiement
```

> Retirer `FEDAPAY_SECRET_KEY` sans revenir sur `PAYMENT_PROVIDER=mock` produit une erreur
> claire à l'initiation (« FedaPay n'est pas configuré… ») : aucun paiement silencieux cassé.

## 4. Checklist de recette (sandbox)

- [ ] **Paiement réussi** : réserver un meublé (ou payer un loyer) → redirection caisse FedaPay → payer avec un numéro de test → webhook reçu → paiement `SUCCESS` → ledger équilibré (`SELECT SUM` des comptes = 0) → quittance PDF générée.
- [ ] **Paiement refusé** : même parcours, numéro de test qui échoue → `FAILED` + message clair, possibilité de réessayer.
- [ ] **Idempotence** : dans Logs du webhook, « Redeliver » un événement déjà traité → réponse `{"received":true,"duplicate":true}`, **aucune** seconde écriture ledger.
- [ ] **Événements parasites** : `transaction.created` et `customer.*` répondent 200 `{"ignored":true}` (le endpoint ne doit pas être désactivé après 10 échecs).
- [ ] **Anti-rejeu** : rejouer un webhook avec un en-tête datant de > 5 min → 401.
- [ ] **Retrait** (Mobile Money) bout-en-bout depuis le wallet propriétaire.
- [ ] Vérifier `/api/health`, puis basculer `FEDAPAY_ENVIRONMENT=live` + clés live + re-test d'un paiement réel à faible montant.

## 5. Dépannage rapide

| Symptôme | Cause probable | Où regarder |
|---|---|---|
| 502 à l'initiation, journal `[FEDAPAY] création refusée` | clé invalide / compte non validé / montant refusé | logs serveur (corps tronqué) |
| Webhook toujours 401 | mauvais `FEDAPAY_WEBHOOK_SECRET`, proxy qui réécrit le corps, horloge décalée > 300 s | logs serveur `[WEBHOOK:fedapay] signature invalide` |
| Paiement payé mais pas confirmé | webhook non reçu (URL inaccessible, HTTPS invalide) — FedaPay rejoue 9× | Dashboard FedaPay → Logs ; rerouter puis « Redeliver » |
| Statut `PENDING` bloqué | transaction expirée (`expired`) mais webhook non livré | redeliver manuel ; la machine à états gère les retards |

## 6. Ensuite (optionnel)

- **KkiaPay** : implémenter la même interface `PaymentProvider` (les effets métier ne bougent pas).
- **Cron facturation** en production : Vercel Cron quotidien appelant `ensureBillingCycle` (fonction déjà prête, cf. `docs/DECISIONS.md` D3.6).
