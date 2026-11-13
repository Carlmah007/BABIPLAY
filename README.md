# BabiPlay

BabiPlay est une plateforme web de démonstration combinant un **portefeuille virtuel partagé**, des **jeux à mise** (Aviator, Tic-Tac-Toe), un **espace de trading simulé**, un **parcours de dépôt/retrait**, des **notifications** et un **back-office multi-rôles** (modérateur, admin, super admin).

> **Statut du projet : développement local uniquement.**
> Toutes les sommes sont des **jetons virtuels**. Aucun paiement réel n'est actif.
> Si `.env.local` renseigne Supabase, seuls l'authentification et les profils passent
> par Supabase ; le portefeuille, les jeux et les paiements restent locaux.

## Sommaire

- [État actuel](#état-actuel)
- [Installation](#installation)
- [Commandes](#commandes)
- [Modes de fonctionnement](#modes-de-fonctionnement)
- [Architecture](#architecture)
- [Paiements](#paiements)
- [Sécurité](#sécurité)
- [Limites connues](#limites-connues)
- [Feuille de route](#feuille-de-route)

## État actuel

Fonctionnalités livrées au fil des paquets de développement :

| Domaine | État |
| --- | --- |
| Socle React + TypeScript strict + Vite + Tailwind | Terminé |
| Shell applicatif, navigation mobile/desktop, routes | Terminé |
| Portefeuille virtuel et ledger idempotent | Terminé |
| Authentification locale de démonstration + 4 rôles | Terminé |
| Moteur Aviator + aléa vérifiable | Interface et service livrés |
| Moteur de trading simulé multi-actifs | Interface et service livrés |
| Tic-Tac-Toe (mise, cotes, IA Minimax, règlement) | Terminé |
| Mining (machines, cycles, incidents, retraits de minage) | Terminé — service + interface + back-office admin |
| Règlement commun idempotent + notifications + audit | Terminé |
| Centre de notifications | Interface livrée |
| Back-office multi-rôles (modérateur / admin / super admin) | Interface livrée — lecture pour modérateurs, actions selon permissions |
| Dépôts et retraits de démonstration | Parcours complet livré — validation Super Admin |
| Abstraction de paiement | Configuration prête — prestataire réel non branché |
| Socle Supabase (schéma + RLS + client typé) | Auth Supabase branchée — RBAC et paiements serveur à porter |
| Déploiement | En ligne sur Vercel — déploiement automatique depuis `main` |
| Paiements réels | Bloqué — API officielle non fournie |

Le détail à jour figure dans [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`SECURITY.md`](./SECURITY.md), [`PAYMENTS.md`](./PAYMENTS.md) et [`docs/GAME_ECONOMY.md`](./docs/GAME_ECONOMY.md).

## Installation

Prérequis : **Node.js 20+** (testé avec Node 24) et npm.

```bash
cd C:\Users\user\Desktop\babiplay
npm install
cp .env.example .env.local
npm run dev
```

L'application est servie par défaut sur **http://localhost:5173**.

> Sous Windows, si `npm` est bloqué par la stratégie PowerShell, utiliser `npm.cmd`.

> **Supabase (optionnel)** : schéma, RLS et comptes de test dans [`supabase/README.md`](./supabase/README.md).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Vérification TypeScript + build de production |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm run lint` | Analyse statique Oxlint |
| `npm test` | Tests unitaires Vitest |
| `npm run preview` | Prévisualisation du build local |

## Modes de fonctionnement

### Mode démonstration (par défaut)

- aucun compte réel requis ;
- portefeuille initial de **50 000 jetons virtuels** ;
- données stockées dans le `localStorage` du navigateur ;
- quatre comptes de démonstration disponibles depuis `/login` :

| Rôle | E-mail | Accès |
| --- | --- | --- |
| Joueur | `demo@babiplay.local` | Jeux, mises, dépôt/retrait |
| Modérateur | `moderateur@babiplay.local` | Back-office en lecture |
| Admin | `gestionnaire@babiplay.local` | Back-office, actions selon permissions |
| Super Admin | `admin@babiplay.local` | Back-office complet, validation des retraits |

- toutes les opérations sont locales et réinitialisables.

### Rôles et permissions

Les permissions sont granulaires (`users.read`, `users.suspend`, `roles.manage`,
`payments.manage`, `audit.read`, etc.) et vérifiées dans les services ainsi que
dans l'interface. Un acteur ne peut attribuer que des rôles inférieurs au sien,
et ne peut jamais valider son propre retrait. **Ces contrôles côté client ne
remplacent pas une vérification serveur** : la version Supabase devra les
rejouer via RLS et Edge Functions.

### Mode utilisateur (préparé, local)

L'architecture d'inscription/connexion locale existe pour valider les parcours. Elle **ne remplace pas** une authentification serveur : les mots de passe hachés et les sessions restent dans le navigateur. La migration vers Supabase Auth est documentée dans `ARCHITECTURE.md`.

### Mode Supabase (si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont renseignés)

Dès que ces deux variables sont présentes dans `.env.local`, l'application bascule sur
Supabase Auth : les comptes démo locaux et leurs boutons d'accès rapide sont masqués.
Créer les utilisateurs dans Supabase Auth, appliquer le schéma puis exécuter
[`supabase/seed/0002_demo_accounts.sql`](./supabase/seed/0002_demo_accounts.sql)
pour attribuer les rôles joueur / modérateur / admin / super admin. Sans ces
variables, l'application reste en mode démonstration locale avec les quatre
comptes de test.

### Mode paiements

`PAYMENT_ENABLED=false` par défaut. Le mode paiement est volontairement inerte : aucune requête réseau, aucun débit/crédit réel, aucun webhook exposé. Voir [`PAYMENTS.md`](./PAYMENTS.md).

## Architecture

```text
src/
  app/          # providers, routeur, routes
  components/   # UI, layout, navigation, feedback, formulaires
  features/     # logique et vues par domaine
  pages/        # pages routées
  stores/       # état observable côté client
  services/     # règles métier et accès aux données
  lib/          # utilitaires purs (validation, stockage, ids, permissions)
  types/        # contrats TypeScript métier
  data/         # configuration et données de démonstration
  styles/       # tokens et responsive
  tests/        # tests unitaires
```

Détails et décisions : [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Paiements

- Le fournisseur réel reste abstrait derrière `PaymentProvider` et désactivé (`DisabledPaymentProvider`) tant que `PAYMENT_ENABLED=false`.
- Un **service de paiement de démonstration** (`paymentService`) permet de tester tout le parcours sans prestataire :
  - dépôt sandbox instantané et idempotent (`demo-sandbox`) ;
  - demande de retrait `pending` avec **réservation** du montant (pas de débit immédiat) ;
  - validation ou refus par un Super Admin disposant de `payments.manage`, avec justification ;
  - annulation possible par le joueur tant que la demande est en attente ;
  - notification et entrée d'audit à chaque étape.
- Règles de retrait de démonstration : minimum **500 jetons**, une seule demande en attente, bénéficiaire vérifié (KYC simulé), frais **0 %** affichés avant confirmation, séparation des duties.
- Aucune clé secrète ne doit être exposée au client : `PAYMENT_SECRET_KEY` et `PAYMENT_WEBHOOK_SECRET` sont **serveur uniquement**.
- L'activation réelle exige l'API officielle, sa documentation, des Edge Functions et une validation explicite.

Comparaison avec la logique bookmaker (Betclic / 1xBet), cotes et formules : [`docs/GAME_ECONOMY.md`](./docs/GAME_ECONOMY.md).

## Sécurité

- Validation systématique des montants, identifiants, statuts et permissions.
- Toutes les mutations de solde passent par `walletService` (aucun composant ne modifie le solde).
- Ledger append-only avec clés d'idempotence.
- Contrôles de rôle côté client pour l'UX ; **ils ne constituent pas une barrière de sécurité serveur**.
- Aucun secret réel dans le dépôt.
- Les actions administratives sensibles sont journalisées dans un audit local.

Voir [`SECURITY.md`](./SECURITY.md) pour l'inventaire complet des mécanismes en place et des limites à lever avant l'ouverture publique.

## Limites connues

- Les données sont locales au navigateur : pas de synchronisation multi-appareils.
- L'authentification locale est une simulation, pas une sécurité de production.
- Les moteurs de jeu s'exécutent dans la couche services locale de démonstration ; la version serveur signée n'est pas branchée.
- Les résultats affichés ne doivent jamais servir de base à de l'argent réel.
- Les cotations de trading sont simulées et ne reflètent aucun marché réel.
- Les dépôts/retraits sont des jetons virtuels : aucun prestataire de paiement n'est appelé (`PAYMENT_ENABLED=false`).
- La persistance Supabase couvre l'authentification et les profils ; portefeuille, jeux et paiements restent dans le `localStorage` du navigateur.
- Le SMTP de Supabase (mails de confirmation) est limité en plan gratuit : brancher un SMTP dédié (Resend ou équivalent) pour un envoi fiable.
- Les permissions de l'interface sont une aide à l'usage ; la vérification serveur (RLS/Edge Functions) reste à faire.
- Le schéma Supabase est prêt dans `supabase/migrations` mais pas encore appliqué ni connecté.
- Aucun déploiement public n'a été effectué.

## Feuille de route

1. Tester manuellement le parcours complet : joueur → mise Tic-Tac-Toe → gain → retrait → validation Super Admin → audit.
2. Persistance Supabase + RLS + Edge Functions.
3. Authentification Supabase et suppression de l'auth locale de démonstration.
4. Moteur de jeu serveur signé et vérifiable.
5. Intégration du fournisseur de paiement officiel après lecture complète de sa documentation.
6. Audit de sécurité externe avant toute manipulation d'argent réel.
