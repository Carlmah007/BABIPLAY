# Architecture BabiPlay

## 1. Principes

- **Une seule source de vérité pour l'argent** : le ledger du portefeuille.
- **Services métier purs et testables** : les composants React ne contiennent pas de règles financières.
- **Contrats typés** : pas de `any` dans les types métier.
- **Idempotence** : chaque mutation possède une clé unique et rejouable.
- **Séparation démo / production** : le mode local actuel est explicitement une démonstration.
- **Extensibilité** : ajout de jeux, d'actifs et de fournisseurs sans réécriture du socle.

## 2. Couches

```text
UI (pages, features, components)
        │  appelle des actions
        ▼
Stores (état observable React)
        │  délèguent
        ▼
Services (règles métier, ledger, auth, jeux, paiements)
        │  utilisent
        ▼
Lib (validation, stockage, permissions, ids, dates)
        │
        ▼
StorageAdapter (localStorage aujourd'hui, Supabase demain)
```

### Règles de dépendance

- `types/` et `lib/` ne dépendent d'aucune couche supérieure.
- `services/` peut dépendre de `types/` et `lib/`.
- `stores/` dépend de `services/` et `lib/store`.
- `features/`, `pages/`, `components/` dépendent des stores et services, jamais l'inverse.
- Aucun composant ne calcule ni ne modifie directement un solde.

## 3. Portefeuille et ledger

Le solde n'est jamais stocké comme un nombre indépendant. Il est **dérivé du dernier mouvement** du ledger.

Chaque mouvement contient :

```ts
{
  id, userId, type, direction, amount, currency, status,
  source, reference, idempotencyKey, balanceAfter, createdAt, metadata
}
```

Principes :

- `direction` vaut `debit`, `credit` ou `neutral`.
- Les débits vérifient le solde disponible avant écriture.
- Une clé d'idempotence déjà utilisée renvoie le mouvement existant au lieu d'en créer un second.
- Les mouvements ne sont jamais modifiés ni supprimés par l'application.
- Les marqueurs `game_loss` / `trading_loss` peuvent être neutres (amount = 0) lorsque la mise a déjà été débitée à l'ouverture.

Le portefeuille initial de démonstration est créé par un mouvement `initial_balance` de **50 000 jetons**.

## 4. Authentification et rôles

Rôles : `player`, `moderator`, `admin`, `super_admin`.

Codes actuels :

- auth locale de démonstration (mots de passe hachés via PBKDF2/Web Crypto, salt par utilisateur) ;
- session persistée dans `localStorage` ;
- comptes de démonstration seedés ;
- contrôle d'accès aux routes et au back-office côté client.

**Limite majeure :** un contrôle frontend est contournable. La version de production doit appliquer les rôles via Supabase Auth, des policies RLS et des Edge Functions. Voir `SECURITY.md`.

## 5. Jeux : moteurs, aléa et règlement

> **État PAQUET 7 BIS** : la couche moteurs/services est livrée et testée.
> Les pages `/aviator`, `/trading` et `/tic-tac-toe` restent des placeholders
> jusqu'aux paquets d'interface. Aucun résultat n'est calculé dans un composant React.

### 5.1 Services communs

**`gameRandomnessService`**

- seeds de 32 octets et nonces de 16 octets via `crypto.getRandomValues` ;
- unicité vérifiée du seed et du nonce avant création d'une manche ;
- hash SHA-256 du seed publié avant la manche (`serverSeedHash`) ;
- dérivation documentée : `SHA-256(seed:nonce:index)` → 32 premiers bits → uniforme `[0, 1)` ;
- seed serveur conservé et révélé uniquement après règlement ;
- vérification a posteriori possible avec `reveal()` / `verify()` ;
- séparation par type de jeu (`aviator`, `trading`, `tic_tac_toe`).

**`gameSettlementService`**

- validation du résultat et calcul `pnl = payout - stake` ;
- crédit `game_win` / `trading_profit` si le payout est positif ;
- marqueur neutre `game_loss` / `trading_loss` si le payout est nul, sans re-débit ;
- clé d'idempotence `game:settle:{jeu}:{manche}` ;
- un règlement identique renvoie l'enregistrement existant (`alreadySettled`) ;
- un règlement différent pour la même manche est refusé (`ConflictError`) ;
- notification et entrée d'audit `game_settled` créées au premier règlement ;
- Tic-Tac-Toe : mise débitée à la création, gain selon la cote du niveau ou remboursement (match nul) crédité au règlement ;
- contrôle d'intégrité Tic-Tac-Toe : le payout doit correspondre exactement à la cote convenue, sinon le règlement est refusé.

Machine d'état commune : `created → started → running → completed → settled`
(ou `cancelled`). Le résultat est enregistré avant affichage et figé après règlement.

### 5.2 Aviator

Distribution publique, identique pour tous les joueurs :

```text
r         = tirage uniforme [0, 1)
brut      = (1 - 0,01) / (1 - r)
crash     = min(500, max(1,01, arrondi au centième inférieur de brut))
```

La marge de 1 % est publique. Chaque manche varie sur le crash, la vitesse de
croissance (`0,07` à `0,32` par seconde), l'intervalle d'affichage et le délai
avant la manche suivante. Le multiplicateur serveur est
`min(crash, exp(vitesse × secondes écoulées))`.

- mise débitée une seule fois (`game_stake`) ;
- retrait validé avec l'heure serveur, refusé après le crash ;
- manche active persistée pour survivre à un rechargement ;
- seed révélé et vérifiable seulement après règlement ;
- aucune adaptation au joueur, à son solde, à ses pertes ou à son historique.

### 5.3 Trading simulé

- actifs BTC, ETH, EUR/USD, GOLD, NASDAQ, paramètres propres dans `data/demoAssets.ts` ;
- ticks de 5 secondes, séries temporelles persistées, ticks purgés au-delà de 600 ;
- chaque actif reçoit un seed dérivé distinct (`SHA-256(seedMarché:symbole)`) ;
- compteur `tickCount` persistant : les tirages restent uniques après purge ;
- régimes publics : tendance haussière, tendance baissière, consolidation,
  accélération, correction ;
- événements éditoriaux `getMarketEvents` (tendance, volatilité, correction,
  stabilisation, session) marqués `simulated: true` et sans effet sur les prix ;
- achat au `ask` pour un long, vente au `bid` pour un short ; sortie symétrique ;
- frais de clôture en points de base, tracés dans la position et le ledger
  (minimum 1 jeton dès qu'un frais est dû) ;
- aucun slippage additionnel : le spread bid/ask publié est le seul frottement ;
- stop-loss, take-profit et expiration facultatifs ;
- clôture manuelle ou automatique au prix serveur de l'horodatage de clôture ;
- position clôturée réglée une seule fois puis immuable.

### 5.4 Tic-Tac-Toe

- règles officielles : X commence toujours ; le joueur peut recevoir X ou O,
  auquel cas l'IA commence ;
- niveau choisi avant la partie et conservé tel quel : `beginner`, `intermediate`, `expert` ;
- expert : Minimax complet ; intermédiaire : profondeur limitée à 4 demi-coups ;
  débutant : 60 % de coups aléatoires, sinon profondeur 1 ;
- entre coups de valeur strictement équivalente, choix aléatoire sécurisé ;
- aucun coup inférieur choisi pour forcer une victoire ou une défaite ;
- l'IA ne joue jamais sur une case occupée ni après la fin ;
- cotes publiées et figées à la création : débutant 1.50×, intermédiaire 2.00×, expert 3.00× ;
- mise de 10 à 10 000 jetons, ou 0 pour une partie gratuite ;
- mise débitée à la création, règlement unique (victoire = mise × cote, match nul remboursé, défaite perdue) ;
- l'interface affiche la cote, le gain potentiel, le gain net et un accès direct au retrait.

## 6. Notifications

Le service `notificationService` est livré : persistance par utilisateur, type,
titre, message, statut lu, priorité, métadonnées et date ; ajout idempotent
optionnel, comptage des non-lus, marquage lu et abonnement.

Le `gameSettlementService` et le `paymentService` créent automatiquement une
notification à chaque règlement, dépôt, demande de retrait et décision de
retrait. Le centre `/notifications` est branché sur le store dédié.

## 7. Administration

Le service `auditService` est livré en mode append-only : aucune API de
modification ou de suppression, entrées figées, acteur `system` autorisé pour
les règlements automatiques.

La route `/admin` est branchée sur un back-office réel : utilisateurs et soldes,
suspension/réactivation, changement de rôle limité par `roles.manage` et par le
principe de moindre privilège, file des retraits à valider (`payments.manage`),
journal d'audit append-only. Chaque action sensible exige une justification et
produit un `AuditLog`. Les modérateurs accèdent à la page en lecture ; les
permissions non accordées désactivent les actions correspondantes.

La vérification frontend reste une aide à l'usage : la version de production
doit revalider chaque permission côté Supabase (RLS + Edge Functions).

## 8. Paiements

Abstraction :

```ts
interface PaymentProvider {
  createDeposit()
  verifyPayment()
  getPaymentStatus()
  handleWebhook()
  requestWithdrawal()
  verifyWithdrawal()
}
```

Le provider actif est `DisabledPaymentProvider` tant que `PAYMENT_ENABLED=false`. Aucun réseau, aucun secret client, aucun crédit automatique.

Un **service de paiement de démonstration** (`paymentService`) permet de tester
le parcours complet sans prestataire réel :

- dépôt sandbox instantané, idempotent, tracé dans le ledger et l'audit ;
- demande de retrait `pending` avec réservation du montant ;
- validation ou refus par un Super Admin disposant de `payments.manage` ;
- séparation des duties (pas d'auto-validation) ;
- annulation par le joueur avant validation ;
- notifications et journal d'audit à chaque étape.

Règles détaillées et comparaison avec le modèle Betclic / 1xBet :
[`docs/GAME_ECONOMY.md`](./docs/GAME_ECONOMY.md).

## 9. Persistance actuelle et cible Supabase

Aujourd'hui : `LocalStorageAdapter` avec clés préfixées `babiplay:v1:*`.

Cible :

| Donnée | Table Supabase |
| --- | --- |
| Utilisateurs | `profiles` + `auth.users` |
| Portefeuilles | `wallets` |
| Mouvements | `ledger_entries` (append-only) |
| Parties | `game_rounds` |
| Positions | `trading_positions` |
| Notifications | `notifications` |
| Audit | `audit_logs` |
| Paiements | `payment_intents`, `withdrawals` |

Règles RLS attendues :

- un joueur ne lit que ses propres lignes ;
- un joueur ne peut jamais écrire un mouvement de ledger directement ;
- les crédits/débits passent par des Edge Functions avec service role ;
- l'admin lit selon ses permissions, jamais avec la clé service role côté client ;
- les webhooks vérifient la signature côté serveur.

## 10. Décisions

| Date | Décision | Raison |
| --- | --- | --- |
| Paquet 0 | Conserver React/Vite/Tailwind | Base saine, build et lint verts |
| Paquet 0 | Ne pas ajouter de routeur externe | Poids et contrôle ; routeur hash local suffisant pour la V1 |
| Paquet 0 | Stores maison basés sur `useSyncExternalStore` | Éviter une dépendance d'état pour un besoin simple |
| Paquet 0 | Paiements désactivés par défaut | Aucune API officielle fournie |
