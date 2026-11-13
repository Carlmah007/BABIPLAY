# Sécurité BabiPlay

## Posture actuelle

BabiPlay est une **plateforme de démonstration** : tous les montants sont des
jetons virtuels, aucun paiement réel n'est actif (`PAYMENT_ENABLED=false`).
Aucune donnée bancaire n'est collectée.

## Défense en profondeur — ce qui est en place

| Couche | Mécanisme | État |
| --- | --- | --- |
| Comptes | Auth Supabase (hachage Argon2/bcrypt géré par Supabase, confirmation email) | ✅ Production |
| Base de données | RLS sur `profiles`, `ledger_movements`, `audit_logs`, `notifications` | ✅ appliquée (migration 20260101) |
| Portefeuille | Ledger append-only, idempotence, solde dérivé du dernier mouvement, interdiction de solde négatif | ✅ couche services |
| Jeux | Aléa vérifiable (seed SHA-256 publié avant la manche, révélé après règlement) | ✅ couche services |
| Retraits | Réservation, séparation des duties (pas d'auto-validation), justification obligatoire | ✅ couche services |
| Audit | Journal append-only, aucune API de modification/suppression | ✅ |
| Secrets | `.env.*` exclu du dépôt ; `service_role` jamais côté client | ✅ |

## Limites connues (à corriger avant ouverture publique)

1. **Les contrôles de rôle de l'interface ne sont qu'une aide à l'usage.**
   Un utilisateur technique peut modifier le rendu dans son navigateur (F12).
   La défense réelle doit être rejouée côté serveur : policies RLS sur les
   nouvelles tables + Edge Functions pour toute action sensible.
2. **Le portefeuille et les données de jeu restent dans le `localStorage`.**
   Un joueur peut modifier SON solde dans SON navigateur ; il ne peut pas
   toucher aux autres. La persistance serveur supprimera cette surface.
3. **Aucun rate limiting applicatif** au-delà de celui fourni par Supabase Auth.
4. **Le mail de confirmation** dépend du SMTP configuré ; un SMTP maison
   (Resend ou équivalent) est requis pour un envoi fiable.

## Règles pour toute évolution

- Une clé `service_role` ne quitte **jamais** Supabase : pas de code client,
  pas de Vercel, pas de dépôt.
- Seules les variables `VITE_*` sont exposées au navigateur ; elles doivent
  rester sans secret (l'« anon key » est publique par conception).
- Toute nouvelle table sensible doit naître avec ses policies RLS.
- Toute mutation de solde passe exclusivement par `walletService` (client) et,
  à terme, par une Edge Function avec service role (serveur).
- Un audit de sécurité externe est requis avant toute manipulation d'argent réel.

## Divulgation

Une faille découverte ? Ne pas l'exploiter ni la publier : ouvrir une issue
privée ou contacter le mainteneur directement.
