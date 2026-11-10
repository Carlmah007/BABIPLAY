-- BabiPlay — RBAC (rôles et permissions granulaires)
-- Migration préparatoire. À appliquer via Supabase CLI sur un projet dédié.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('player','moderator','admin','super_admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  name text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role text not null check (role in ('player','moderator','admin','super_admin')),
  permission text not null references public.permissions(name) on delete cascade,
  primary key (role, permission)
);

-- Journal d'audit append-only : aucune mise à jour ni suppression.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  justification text not null,
  result text not null default 'success',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- Aucune politique d'update/delete sur audit_logs : append-only.

alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

-- Lecture de son propre profil.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

-- Lecture des profils par les rôles d'administration.
create policy "profiles_select_admin" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('moderator','admin','super_admin')
        and p.status = 'active'
    )
  );

-- Seul le service role (Edge Functions) modifie les rôles.
create policy "profiles_update_service" on public.profiles
  for update using (false);

-- Permissions et role_permissions lisibles par tous les authentifiés.
create policy "permissions_select_all" on public.permissions
  for select using (auth.role() = 'authenticated');

create policy "role_permissions_select_all" on public.role_permissions
  for select using (auth.role() = 'authenticated');

-- Audit : lecture selon le rôle, écriture uniquement via service role.
create policy "audit_select_admin" on public.audit_logs
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('moderator','admin','super_admin')
        and p.status = 'active'
    )
  );

create policy "audit_insert_service" on public.audit_logs
  for insert with check (false);
