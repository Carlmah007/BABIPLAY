# Connecter Supabase — guide complet (BabiPlay)

Ce guide connecte le projet Supabase, applique le schéma (profils, ledger,
audit, notifications) et prépare l'authentification. Une fois terminé,
envoie-moi l'URL + la clé anon : je branche le code (auth + données).

> ⚠️ N'exécute **qu'un seul** fichier SQL : `supabase/migrations/20260101000000_init.sql`.
> `supabase/legacy/0001_rbac.sql` est une ancienne version **incompatible**
> (elle crée `profiles` avec une autre clé). Ne la lance pas.

---

## Récapitulatif : tout ce que tu dois saisir

| Où | Champ | Valeur à saisir |
| --- | --- | --- |
| Supabase → New project | **Name** | `babiplay` |
| Supabase → New project | **Region** | la plus proche (ex. `Frankfurt / eu-central-1`) |
| Supabase → New project | **Database Password** | un mot de passe fort, **à conserver** |
| Supabase → Settings → API | **Project URL** | `https://xxxx.supabase.co` (copier) |
| Supabase → Settings → API | **anon public** | la clé qui commence par `eyJ…` (copier) |
| `.env.local` (dans `babiplay/`) | **VITE_SUPABASE_URL** | l'URL du projet |
| `.env.local` | **VITE_SUPABASE_ANON_KEY** | la clé anon |
| Supabase → SQL Editor | **Requête** | le contenu de `supabase/migrations/20260101000000_init.sql` |
| Supabase → Authentication → URL Configuration | **Site URL** | `http://localhost:5173` |
| Supabase → Authentication → URL Configuration | **Redirect URLs** | `http://localhost:5173/**` |
| Supabase → Authentication → Providers → Email | **Confirm email** | désactivé (dev) |
| Supabase → SQL Editor (après ton inscription) | rôle admin | `update public.profiles set role = 'super_admin' where email = 'ton@email';` |

> ❌ Ne mets **jamais** la clé `service_role` dans `.env.local` ni dans une variable `VITE_`.
> Elle reste côté serveur uniquement.

---

## Étape 1 — Créer le projet Supabase

1. Va sur <https://supabase.com/dashboard> et connecte-toi (GitHub / Google / e-mail).
2. Clique **New project**.
3. Renseigne :
   - **Name** : `babiplay`
   - **Database Password** : mot de passe fort → **note-le** (utile plus tard pour l'accès direct à la base).
   - **Region** : la plus proche de toi (Europe : `Frankfurt` ou `Ireland`).
4. Clique **Create new project** et attends ~2 minutes (provisioning).

## Étape 2 — Récupérer les deux clés

1. Dans le projet : **Settings** (⚙️) → **API** (ou bouton **Connect**).
2. Copie :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon / public key** → longue chaîne commençant par `eyJ…`
3. Ne copie **pas** `service_role` pour l'instant.

## Étape 3 — Configurer l'application

1. Dans `C:\Users\user\Desktop\babiplay`, ouvre le fichier **`.env.local`**
   (il existe déjà avec des valeurs vides).
2. Remplis les deux lignes :

```bash
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

3. Enregistre. Ce fichier est ignoré par git (`*.local`), il ne sera jamais publié.

## Étape 4 — Appliquer le schéma SQL

1. Dans Supabase : **SQL Editor** → **New query**.
2. Ouvre le fichier `supabase/migrations/20260101000000_init.sql` et copie **tout** son contenu.
   Sous Windows, le plus simple :

```powershell
Get-Content 'C:\Users\user\Desktop\babiplay\supabase\migrations\20260101000000_init.sql' -Raw | Set-Clipboard
```

3. Colle dans l'éditeur SQL puis clique **Run**.
4. Le script crée :
   - `profiles` (profil auto-créé à l'inscription, rôle et statut protégés),
   - `ledger_movements` (registre append-only, idempotence, solde dérivé),
   - `audit_logs` (journal append-only, lecture admin),
   - `notifications`,
   - les fonctions `is_admin()` et `current_balance()`,
   - toutes les politiques **Row Level Security** (RLS).

## Étape 5 — Configurer l'authentification

1. **Authentication** → **URL Configuration** :
   - **Site URL** : `http://localhost:5173`
   - **Redirect URLs** : ajoute `http://localhost:5173/**`
2. **Authentication** → **Providers** → **Email** :
   - vérifie que **Email** est activé ;
   - pour le développement, désactive **Confirm email** (sinon il faut cliquer un lien reçu par e-mail avant de pouvoir se connecter).
3. (Plus tard, pour la prod : remplace l'URL par ton domaine et réactive la confirmation.)

## Étape 6 — Créer le premier Super Admin

1. Dans l'app (une fois le code branché), crée un compte via **Inscription**.
   Le profil est créé automatiquement par le trigger `on_auth_user_created`.
2. Dans **SQL Editor**, donne-lui le rôle admin :

```sql
update public.profiles
set role = 'super_admin'
where email = 'ton@email.com';

select id, email, role, status from public.profiles;
```

## Étape 7 — Vérifier que tout est en place

Dans **SQL Editor** :

```sql
-- Les 4 tables existent et la RLS est active
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Les politiques sont créées
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Tu dois voir `profiles`, `ledger_movements`, `audit_logs`, `notifications`
avec `rowsecurity = true` et les politiques correspondantes.

## Étape 8 — Ce que tu m'envoies

Dans le chat, colle simplement :

```text
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

(La clé **anon** est publique par conception — ce n'est pas un secret.
Ne m'envoie jamais la clé `service_role`.)

Je fais ensuite la bascule côté code :
1. `authService` → **Supabase Auth** (inscription, connexion, session, rôles) ;
2. `walletService` + `gameSettlementService` → **Edge Function + RLS** (le ledger devient réellement serveur) ;
3. suppression des comptes de test et de `localStorage` comme source de vérité.

---

## Rappels de sécurité

- RLS est **activée** sur toutes les tables : même avec la clé anon, un joueur ne lit que ses propres données.
- Les écritures du ledger ne sont **pas** autorisées au client (aucune politique INSERT pour `authenticated`) : elles passeront par une Edge Function `service_role`.
- `.env.local` n'est jamais commité ; `.env.example` ne contient que des valeurs vides.
- La clé `service_role` contourne la RLS : elle ne doit exister que côté serveur (Edge Functions / CI).
