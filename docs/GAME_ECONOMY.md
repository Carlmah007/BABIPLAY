# Économie des jeux et retraits

Ce document décrit la logique implémentée dans BabiPlay pour les mises, les gains
et les retraits. Elle s'inspire du **modèle bookmaker** utilisé par des opérateurs
comme Betclic et 1xBet, sans reprendre leurs montants ni leurs conditions exactes :
ces dernières changent par pays, par moyen de paiement et au fil du temps, et
doivent être vérifiées contractuellement avant toute mise en production.

> **Aucun paiement réel n'est actif.** Tous les montants sont des jetons virtuels
> stockés dans le ledger local. `PAYMENT_ENABLED=false`.

## 1. Ce qui caractérise le modèle Betclic / 1xBet

Les deux opérateurs suivent la même logique générale, avec des variantes :

| Brique | Modèle bookmaker | Implémentation BabiPlay (démo) |
| --- | --- | --- |
| Prix du pari | Cote fixée avant le pari | Cote fixée à la création de la partie |
| Gain brut | `mise × cote` | `mise × cote` du niveau choisi |
| Mise | Débitée à la prise du pari | Débitée une seule fois au lancement |
| Match nul / push | Mise remboursée selon le marché | Mise remboursée (cote 1.00) |
| Perte | Mise conservée par l'opérateur | Mise perdue, aucun gain |
| Solde | Disponible + montants engagés | Ledger + réservations de retrait |
| Retrait | Seuil minimum, KYC, moyen de paiement | Seuil, KYC simulé, validation opérateur |
| Délai | Validation puis traitement bancaire | Demande `pending` puis validation admin |
| Bonus | Conditions de mise (rollover) | Non implémenté — à prévoir avant bonus réel |
| Sécurité | Vérification serveur, AML, audit | Permissions + ledger idempotent + audit local |

### Betclic (repères publics)

- cotes décimales : le gain éventuel inclut la mise ;
- retraits vers le compte bancaire ou le moyen de paiement utilisé ;
- vérification d'identité (KYC) avant le premier retrait ;
- retraits traités après validation, avec un seuil minimal ;
- bonus soumis à des conditions de mise avant retrait.

### 1xBet (repères publics)

- très large choix de moyens de paiement (cartes, virements, portefeuilles,
  crypto) ;
- seuils de dépôt/retrait variables selon le moyen choisi ;
- compte vérifié et bénéficiaire au même nom que le titulaire ;
- une demande de retrait à la fois en attente, traitement après contrôle ;
- bonus et promotions soumis à des exigences de mise (rollover).

**Différence importante** : chez un bookmaker, la cote est un prix de marché. Ici,
le Tic-Tac-Toe est un **jeu à cote fixe** contre une IA : la cote est publiée par
niveau et ne dépend ni du joueur, ni de son solde, ni de son historique.

## 2. Tic-Tac-Toe : cotes et règlement

| Niveau | Difficulté | Cote victoire | Match nul | Défaite |
| --- | --- | --- | --- | --- |
| Débutant | IA parfois aléatoire | 1.50× | mise remboursée | mise perdue |
| Intermédiaire | Minimax profondeur 4 | 2.00× | mise remboursée | mise perdue |
| Expert | Minimax complet | 3.00× | mise remboursée | mise perdue |

Formules :

```text
mise            ∈ {0} ∪ [10, 10 000] jetons
gain brut       = arrondi(mise × cote)        si victoire
remboursement   = mise                        si match nul
gain            = 0                           si défaite
gain net (PnL)  = gain brut − mise
```

Garanties :

- la cote est **figée dans la partie** (`multiplier`) et ne peut plus changer ;
- le règlement refuse tout gain qui ne correspond pas à la cote convenue ;
- le débit de mise a lieu une seule fois, avec la clé
  `tic_tac_toe:stake:{gameId}` ;
- le crédit de gain utilise la clé idempotente
  `game:settle:tic_tac_toe:{gameId}` ;
- une partie gratuite (`mise = 0`) ne peut jamais verser de gain ;
- une partie terminée est réglée une seule fois puis figée.

> L'IA expert joue le meilleur coup : un joueur ne peut pas la battre si elle
> commence ou si elle répond parfaitement. La cote élevée reflète ce risque.

## 3. Parcours de retrait

### Étape 1 — Demande du joueur

Conditions vérifiées côté service :

1. compte actif ;
2. montant entre **500** et **100 000** jetons ;
3. moyen de retrait valide (`mobile_money`, `bank_transfer`, `crypto`) ;
4. bénéficiaire renseigné (4 à 120 caractères) ;
5. conditions acceptées explicitement (KYC + compte au même nom) ;
6. aucune autre demande en attente ;
7. montant ≤ solde disponible **moins les retraits déjà réservés**.

La demande est créée en statut `pending`. Le montant est **réservé** : il n'est
pas débité du ledger, mais il n'est plus proposé au retrait.

### Étape 2 — Contrôle opérateur

- permission requise : `payments.manage` (Super Admin) ;
- justification de 10 caractères minimum ;
- **séparation des duties** : un opérateur ne peut pas valider son propre retrait ;
- validation : débit `withdrawal` dans le ledger, statut `confirmed` ;
- refus : statut `cancelled`, réservation libérée, notification au joueur ;
- toute décision crée une entrée d'audit append-only.

### Étape 3 — Annulation par le joueur

Tant qu'une demande est `pending`, le joueur peut l'annuler. Aucun débit n'a
encore eu lieu : la réservation est simplement libérée.

### Frais et net versé

```text
frais    = arrondi(montant × taux_frais)
net      = montant − frais
```

En démonstration, `taux_frais = 0 %`. Le taux et le net sont **affichés avant
confirmation**. Un taux non nul devra être décidé par la configuration
opérationnelle et documenté dans les conditions générales.

## 4. Dépôt de démonstration

- montant entre **500** et **1 000 000** jetons ;
- crédit instantané via le fournisseur `demo-sandbox` ;
- mouvement `deposit` dans le ledger, notification et audit ;
- clé d'idempotence pour empêcher tout double crédit.

En production, le dépôt devra passer par une intention de paiement, un webhook
signé et une confirmation serveur : le client ne devra jamais créditer un solde.

## 5. Ce qui reste à faire avant un vrai retrait

1. **Supabase Auth + RLS** : rôles et permissions vérifiés côté serveur.
2. **Edge Functions** : création d'intention, validation, webhook, idempotence
   PostgreSQL atomique.
3. **KYC réel** : vérification d'identité et contrôle du bénéficiaire.
4. **AML / lutte contre la fraude** : mêmes moyen de dépôt/retrait, plafonds,
   contrôle des comptes multiples.
5. **Registre des paiements** : `payment_intents`, `withdrawals`, statuts,
   historique immuable.
6. **Conditions de bonus / rollover** si des bonus sont distribués.
7. **Jeu responsable** : limites de dépôt, auto-exclusion, plafonds de perte.
8. **Prestataire agréé** : API officielle, clés côté serveur, webhooks signés,
   rapprochement comptable.

## 6. Pourquoi ce modèle est défendable en test réel

- le solde est toujours dérivé du ledger, jamais d'un champ modifiable ;
- les mises et gains sont idempotents et figés ;
- les retraits sont réservés puis validés par un humain habilité ;
- les actions sensibles sont limitées par permission, justifiées et auditées ;
- aucun composant frontend ne peut modifier un solde ou une cote ;
- les paiements réels restent désactivés tant que le socle serveur n'est pas en
  place.

## 7. Parcours validé manuellement (mode démo local)

Scénario exécuté dans le navigateur avec le compte joueur de démonstration :

1. Partie Tic-Tac-Toe débutant, mise de **100 jetons** (cote 1.50×).
2. Victoire : gain brut **150 jetons**, gain net **+50**.
3. Ledger : `game_stake` −100 (solde 49 900) puis `game_win` +150 (50 050).
4. Demande de retrait de **500 jetons** vers un numéro mobile money, conditions
   KYC acceptées. Statut `pending`, montant réservé, solde inchangé.
5. Déconnexion, connexion Super Admin, validation avec justification.
6. Ledger : `withdrawal` −500 (49 550). Réservation libérée, demande `confirmed`.
7. Notifications : gain de jeu, retrait en attente, retrait validé.
8. Audit : `game_settled`, `payment_withdrawal_requested`,
   `payment_withdrawal_approved` avec l'acteur et la justification.
9. Modérateur et Admin : accès au back-office, file de retraits en **lecture
   seule** (permission `payments.manage` réservée au Super Admin).

Résultat : 123 tests automatisés au vert, typecheck et build OK.

> Pour rejouer ce parcours, l'application doit être en mode démo local. Si
> `VITE_SUPABASE_URL` est renseigné dans `.env.local`, les comptes démo sont
> masqués et il faut utiliser les comptes Supabase (voir
> `supabase/seed/0002_demo_accounts.sql`).
