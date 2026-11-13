-- =============================================================================
-- BabiPlay — migration 2 : jeux, positions de trading, paiements, minage
-- Exécute cette migration APRÈS 20260101000000_init.sql.
-- Conventions :
--   - chaque table porte ses policies RLS (jamais de table sans policy) ;
--   - un joueur ne lit et n'écrit que ses propres lignes ;
--   - les lecteurs/admins passent par les helpers is_admin / has_role
--     définis dans la migration 1 ;
--   - les mouvements de ledger restent écrits uniquement par le serveur
--     (service role) : aucune policy INSERT pour les joueurs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rounds de jeu (Aviator / Tic-Tac-Toe / trading rattaché au manche)
-- -----------------------------------------------------------------------------
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_kind text not null check (game_kind in ('aviator', 'trading', 'tic_tac_toe')),
  status text not null check (
    status in ('created', 'started', 'running', 'completed', 'settled', 'cancelled')
  ),
  stake numeric not null default 0 check (stake >= 0),
  multiplier numeric check (multiplier is null or multiplier > 0),
  payout numeric not null default 0 check (payout >= 0),
  pnl numeric,
  server_seed_hash text,
  server_seed text,
  nonce bigint,
  board jsonb,
  result jsonb,
  stake_idempotency_key text,
  settle_idempotency_key text unique,
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists game_rounds_user_started_idx
  on public.game_rounds (user_id, started_at desc);

alter table public.game_rounds enable row level security;

create policy "game_rounds_select_own"
  on public.game_rounds for select
  using (auth.uid() = user_id);

create policy "game_rounds_insert_own"
  on public.game_rounds for insert
  with check (auth.uid() = user_id);

create policy "game_rounds_admin_select"
  on public.game_rounds for select
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Positions de trading simulé
-- -----------------------------------------------------------------------------
create table if not exists public.trading_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (symbol in ('BTC', 'ETH', 'EURUSD', 'GOLD', 'NASDAQ')),
  direction text not null check (direction in ('long', 'short')),
  stake numeric not null check (stake > 0),
  entry_price numeric not null check (entry_price > 0),
  exit_price numeric check (exit_price is null or exit_price > 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  pnl numeric,
  payout numeric not null default 0 check (payout >= 0),
  fee numeric not null default 0 check (fee >= 0),
  close_reason text check (close_reason in ('manual', 'stop_loss', 'take_profit', 'expired')),
  stop_loss_percent numeric,
  take_profit_percent numeric,
  expires_at timestamptz,
  settled_at timestamptz,
  demo boolean not null default true
);

create index if not exists trading_positions_user_opened_idx
  on public.trading_positions (user_id, opened_at desc);
create index if not exists trading_positions_open_idx
  on public.trading_positions (user_id) where status = 'open';

alter table public.trading_positions enable row level security;

create policy "trading_positions_select_own"
  on public.trading_positions for select
  using (auth.uid() = user_id);

create policy "trading_positions_insert_own"
  on public.trading_positions for insert
  with check (auth.uid() = user_id);

create policy "trading_positions_admin_select"
  on public.trading_positions for select
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Paiements : dépôts et retraits (intents)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0),
  currency text not null default 'BABI',
  status text not null check (
    status in ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  reference text not null unique,
  idempotency_key text not null unique,
  provider text not null default 'demo-sandbox',
  method text check (method in ('mobile_money', 'bank_transfer', 'crypto')),
  destination text,
  fee numeric not null default 0 check (fee >= 0),
  net_amount numeric not null default 0 check (net_amount >= 0),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  failure_reason text,
  demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_user_created_idx
  on public.payment_intents (user_id, created_at desc);
create index if not exists payment_intents_pending_idx
  on public.payment_intents (created_at desc) where status in ('pending', 'processing');

alter table public.payment_intents enable row level security;

create policy "payment_intents_select_own"
  on public.payment_intents for select
  using (auth.uid() = user_id);

create policy "payment_intents_insert_own"
  on public.payment_intents for insert
  with check (auth.uid() = user_id and user_id = auth.uid());

-- Un joueur ne modifie jamais une intent : uniquement le serveur (service role).
-- Les admins lisent tout ; seuls les super admins peuvent relire la revue.
create policy "payment_intents_admin_select"
  on public.payment_intents for select
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Journal d'événements de minage (partie consultable par l'admin)
-- NB : l'état de minage reste côté client pour l'instant ; cette table
-- n'enregistre que les événements publiables (achat de machine, incident,
-- retrait de récompenses) pour l'audit administrateur.
-- -----------------------------------------------------------------------------
create table if not exists public.mining_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  machine_id text,
  amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mining_events_user_created_idx
  on public.mining_events (user_id, created_at desc);

alter table public.mining_events enable row level security;

create policy "mining_events_select_own"
  on public.mining_events for select
  using (auth.uid() = user_id);

create policy "mining_events_insert_own"
  on public.mining_events for insert
  with check (auth.uid() = user_id);

create policy "mining_events_admin_select"
  on public.mining_events for select
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Vérifications post-migration (à lire dans le SQL Editor)
-- -----------------------------------------------------------------------------
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public'
--  order by tablename, policyname;
