# Matrice des permissions BabiPlay

| Permission | player | moderator | admin | super_admin |
| --- | --- | --- | --- | --- |
| users.read |  | ✓ | ✓ | ✓ |
| users.suspend |  |  | ✓ | ✓ |
| users.manage |  |  | ✓ | ✓ |
| moderators.manage |  |  | ✓ | ✓ |
| admins.manage |  |  |  | ✓ |
| roles.manage |  |  |  | ✓ |
| wallets.read |  |  | ✓ | ✓ |
| wallets.adjust |  |  |  | ✓ |
| transactions.read |  | ✓ | ✓ | ✓ |
| games.manage |  |  | ✓ | ✓ |
| games.toggle |  |  | ✓ | ✓ |
| notifications.manage |  |  | ✓ | ✓ |
| settings.manage |  |  |  | ✓ |
| audit.read |  | ✓ | ✓ | ✓ |
| payments.manage |  |  |  | ✓ |
| reports.read |  | ✓ | ✓ | ✓ |

## Règles
- `wallets.adjust` et `roles.manage` sont réservés au Super Admin.
- `admins.manage` est réservé au Super Admin.
- Les permissions sont vérifiées côté serveur (RLS + Edge Functions), jamais uniquement côté frontend.
- Les journaux d'audit sont append-only : aucune mise à jour ni suppression.

## Accès au back-office

| Rôle | Accès `/admin` | Portée |
| --- | --- | --- |
| player | Non | — |
| moderator | Oui | Lecture des utilisateurs et de l'audit ; aucune action sensible |
| admin | Oui | Suspension, gestion des rôles inférieurs (`player`, `moderator`) |
| super_admin | Oui | Toutes les actions, y compris `roles.manage`, `wallets.adjust` et `payments.manage` |

`canAccessAdminPanel()` autorise l'entrée dans l'espace dès qu'une permission de
lecture ou d'action administrative est présente. Chaque bouton reste ensuite
conditionné par sa permission précise.

## Paiements et retraits

- La création d'une demande de retrait est ouverte à tout compte actif.
- La validation ou le refus exige `payments.manage` (Super Admin uniquement).
- Un opérateur ne peut jamais valider son propre retrait (séparation des duties).
- Toute décision exige une justification d'au moins 10 caractères, crée une
  notification pour le joueur et une entrée d'audit append-only.
- Le montant est réservé pendant `pending` ; le débit du ledger n'a lieu qu'à la
  validation.

## Portée actuelle

Ces règles sont implémentées dans la couche services et reflétées dans l'UI.
Elles devront être rejouées côté Supabase (RLS + Edge Functions) avant toute
manipulation d'argent réel.
