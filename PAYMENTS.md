# Paiements BabiPlay

## État

**Désactivés par défaut.** `PAYMENT_ENABLED=false` : aucune requête réseau, aucun
débit/crédit réel, aucun webhook exposé, aucune donnée bancaire collectée.

## Parcours de démonstration (jetons virtuels)

Le `paymentService` teste le parcours complet sans prestataire réel :

1. **Dépôt sandbox** — instantané, idempotent (`demo-sandbox`), tracé dans le
   ledger et l'audit.
2. **Demande de retrait** — statut `pending`, le montant est **réservé**
   (soustrait du disponible, pas débité du ledger).
3. **Décision Super Admin** — validation ou refus par un compte disposant de
   `payments.manage`, avec justification d'au moins 10 caractères.
4. **Annulation** — possible par le joueur tant que la demande est en attente.

À chaque étape : notification au joueur + entrée d'audit append-only.

## Règles de retrait

| Règle | Valeur |
| --- | --- |
| Montant minimum | 500 jetons |
| Demandes simultanées | 1 seule en attente |
| Bénéficiaire | vérifié (KYC simulé) |
| Frais | 0 %, affichés avant confirmation |
| Auto-validation | impossible (séparation des duties) |

## Secrets

| Variable | Où | Usage |
| --- | --- | --- |
| `PAYMENT_SECRET_KEY` | serveur uniquement | signature des intents |
| `PAYMENT_WEBHOOK_SECRET` | serveur uniquement | vérification des webhooks |
| `VITE_PAYMENT_*` | client | configuration non sensible |

Aucun secret réel dans le dépôt. Toute intégration d'un prestataire réel exigera :
l'API officielle + sa documentation lue intégralement, des Edge Functions côté
serveur, une vérification de signature des webhooks, et un audit de sécurité
externe.
