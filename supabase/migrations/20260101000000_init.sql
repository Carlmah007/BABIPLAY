-- =============================================================================
-- BabiPlay — Migration initiale : schéma + Row Level Security
-- -----------------------------------------------------------------------------
-- À exécuter dans le SQL Editor de Supabase (ou via `supabase db push`).
--
-- Conventions :
--   * identifiants : uuid (auth.users) côté base ; préfixes texte côté client.
--   * montants : numeric(30,6). La V1 arrondit à 2 décimales à l'affichage.
--   * metadata : jsonb.
--   * ledger et audit : append-only (aucune politique UPDATE/DELETE).
--   * service_role contourne RLS (lecture/écriture serveur) : ne jamais
--     exposer cette clé côté client.
-- =============================================================================

-- =============================================================================
-- Reset idempotent : repart d'une base propre si une ancienne version a été
-- appliquée (ex. 0001_rbac). Projet neuf : aucune donnée à conserver.
-- =============================================================================
drop table if exists public.role_permissions cascade;
drop table if exists public.permissions cascade;
drop table if exists public.notifications cascade;
drop table if exists public.ledger_movements cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.profiles cascade;

-- =============================================================================
-- 1. PROFILS
-- =============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  role         text not null default 'player'
               check (role in ('player', 'moderator', 'admin', 'super_admin')),
  status       text not null default 'active'
               check (status in ('active', 'suspended')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Profil applicatif rattaché à un utilisateur auth.users.';

-- Création automatique du profil à l'inscription (Supabase Auth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tenue à jour de updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Rôle et statut : modifiables uniquement côté serveur.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role')
     and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    raise exception 'role and status can only be changed by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- =============================================================================
-- 2. LEDGER (portefeuille virtuel, append-only)
-- =============================================================================
create table if not exists public.ledger_movements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  type            text not null check (type in (
                    'initial_balance', 'game_stake', 'game_win', 'game_loss',
                    'trading_open', 'trading_profit', 'trading_loss',
                    'deposit', 'withdrawal', 'refund', 'adjustment'
                  )),
  direction       text not null check (direction in ('debit', 'credit', 'neutral')),
  amount          numeric(30,6) not null check (amount >= 0),
  currency        text not null default 'BABI',
  status          text not null default 'completed'
                  check (status in ('completed', 'pending', 'cancelled')),
  source          text not null check (source in (
                    'system', 'aviator', 'trading', 'tic_tac_toe', 'payments', 'admin'
                  )),
  reference       text not null,
  idempotency_key text not null,
  balance_after   numeric(30,6) not null,
  created_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,
  unique (user_id, idempotency_key)
);

comment on table public.ledger_movements is 'Registre append-only des mouvements du portefeuille virtuel.';
comment on column public.ledger_movements.balance_after is
  'Solde après mouvement. À calculer côté serveur pour garantir un ordre sans course (race-free).';

create index if not exists ledger_movements_user_created_idx
  on public.ledger_movements (user_id, created_at desc);

-- Solde courant = solde après le dernier mouvement.
create or replace function public.current_balance(p_user_id uuid)
returns numeric(30,6)
language sql
stable
security definer
set search_path = public
as $$
  select balance_after
  from public.ledger_movements
  where user_id = p_user_id
  order by created_at desc, id desc
  limit 1;
$$;

-- =============================================================================
-- 3. JOURNAL D'AUDIT (append-only, lecture admin)
-- =============================================================================
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references auth.users (id) on delete set null,
  actor_role    text not null
                check (actor_role in ('player', 'moderator', 'admin', 'super_admin', 'system')),
  action        text not null check (action in (
                  'user_suspended', 'user_reactivated', 'balance_adjusted', 'role_changed',
                  'payment_setting_changed', 'transaction_refunded',
                  'admin_access_denied', 'game_settled'
                )),
  target_type   text not null check (target_type in ('user', 'wallet', 'payment', 'setting', 'system')),
  target_id     text not null,
  justification text not null,
  created_at    timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb
);

comment on table public.audit_logs is 'Journal audit append-only des actions sensibles.';

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- =============================================================================
-- 4. NOTIFICATIONS
-- =============================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in (
               'game_win', 'game_loss', 'game_result', 'balance_change', 'deposit',
               'withdrawal', 'payment_failed', 'admin', 'security', 'account_status'
             )),
  title      text not null,
  message    text not null,
  read       boolean not null default false,
  priority   text not null default 'normal' check (priority in ('normal', 'important')),
  created_at timestamptz not null default now(),
  metadata   jsonb not null default '{}'::jsonb
);

comment on table public.notifications is 'Notifications utilisateur.';
-- Note : la politique UPDATE permet de marquer "read". Si on veut empêcher la
-- modification de title/message côté client, ajouter un trigger dédié.

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read = false;

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

-- L'utilisateur connecté est-il un admin actif ?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
      and status = 'active'
  );
$$;

alter table public.profiles         enable row level security;
alter table public.ledger_movements enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.notifications    enable row level security;

-- profiles : chacun lit et modifie son propre profil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles : les admins lisent tout (back-office).
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles for select
  using (public.is_admin());

-- ledger : lecture de ses propres mouvements uniquement.
-- Écriture volontairement sans politique client : toute mutation de solde doit
-- passer par une Edge Function / un moteur signé côté serveur.
drop policy if exists "ledger_select_own" on public.ledger_movements;
create policy "ledger_select_own"
  on public.ledger_movements for select
  using (user_id = auth.uid());

-- audit : lecture admin uniquement ; écriture serveur.
drop policy if exists "audit_admin_select" on public.audit_logs;
create policy "audit_admin_select"
  on public.audit_logs for select
  using (public.is_admin());

-- notifications : lecture et marquage de ses propres notifications ; écriture serveur.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 6. GRANTS
-- -----------------------------------------------------------------------------
-- service_role dispose déjà de tous les droits et contourne RLS.
-- On n'accorde que le minimum aux rôles JWT (anon / authenticated).
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles         to authenticated;
grant update on public.profiles         to authenticated;
grant select on public.ledger_movements to authenticated;
grant select on public.audit_logs       to authenticated;
grant select, update on public.notifications to authenticated;

-- =============================================================================
-- 7. BACKFILL — profils des utilisateurs déjà inscrits avant la migration
-- =============================================================================
insert into public.profiles (id, email, display_name)
select
  id,
  coalesce(email, ''),
  coalesce(raw_user_meta_data ->> 'display_name', split_part(coalesce(email, 'joueur'), '@', 1))
from auth.users
on conflict (id) do nothing;
