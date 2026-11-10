-- =============================================================================
-- BabiPlay — comptes de test Supabase pour les 4 rôles
-- =============================================================================
--
-- À exécuter APRÈS `migrations/20260101000000_init.sql`, dans le SQL Editor du
-- tableau de bord Supabase (rôle `postgres`, seul autorisé à modifier `role`).
--
-- Prérequis : créer les quatre utilisateurs dans Supabase Auth (Authentication >
-- Users > Add user, ou via la page /register de l'application). Utiliser
-- exactement les e-mails ci-dessous, avec un mot de passe de test solide, et
-- cocher « Auto Confirm User » (ou désactiver la confirmation d'e-mail pour le
-- projet de test). Le trigger `handle_new_user` crée automatiquement leur profil
-- avec le rôle `player`.
--
-- Ce script ne crée ni mot de passe ni utilisateur Auth : il promeut des profils
-- existants. Il peut être relancé sans risque (opérations idempotentes).
--
-- ⚠️ Comptes de test uniquement. Ne jamais réutiliser ces e-mails ni ces rôles en
-- production, et ne pas laisser de mot de passe de test actif.
-- =============================================================================

-- 1. Crée les profils manquants si le trigger n'a pas tourné (ex. import manuel).
insert into public.profiles (id, email, display_name)
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data ->> 'display_name', split_part(coalesce(email, 'joueur'), '@', 1))
from auth.users
where email in (
  'demo@babiplay.local',
  'moderateur@babiplay.local',
  'gestionnaire@babiplay.local',
  'admin@babiplay.local'
)
on conflict (id) do nothing;

-- 2. Attribue le rôle attendu à chaque compte.
update public.profiles set role = 'player'
  where email = 'demo@babiplay.local';

update public.profiles set role = 'moderator'
  where email = 'moderateur@babiplay.local';

update public.profiles set role = 'admin'
  where email = 'gestionnaire@babiplay.local';

update public.profiles set role = 'super_admin'
  where email = 'admin@babiplay.local';

-- 3. Réactive les comptes (utile après une suspension de test).
update public.profiles set status = 'active'
  where email in (
    'demo@babiplay.local',
    'moderateur@babiplay.local',
    'gestionnaire@babiplay.local',
    'admin@babiplay.local'
  );

-- 4. Vérification : les quatre lignes doivent apparaître avec le bon rôle.
select email, display_name, role, status
from public.profiles
where email in (
  'demo@babiplay.local',
  'moderateur@babiplay.local',
  'gestionnaire@babiplay.local',
  'admin@babiplay.local'
)
order by case role
  when 'player' then 1
  when 'moderator' then 2
  when 'admin' then 3
  when 'super_admin' then 4
  else 5
end;
