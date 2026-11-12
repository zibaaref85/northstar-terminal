-- Northstar user-owned data. Apply only after creating a Supabase project.
-- No market-data provider secrets belong in this database or browser client.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  created_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 64),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and char_length(symbol) between 1 and 12),
  created_at timestamptz not null default now(),
  constraint watchlist_items_watchlist_owner_fk
    foreign key (watchlist_id, user_id)
    references public.watchlists (id, user_id) on delete cascade,
  unique (watchlist_id, symbol)
);

create table if not exists public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and char_length(symbol) between 1 and 12),
  quantity numeric(20, 8) not null check (quantity > 0),
  average_cost numeric(20, 8) not null check (average_cost > 0),
  opened_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and char_length(symbol) between 1 and 12),
  direction text not null check (direction in ('above', 'below')),
  target_price numeric(20, 8) not null check (target_price > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists watchlists_user_created_idx on public.watchlists (user_id, created_at);
create index if not exists watchlist_items_owner_idx on public.watchlist_items (user_id, watchlist_id);
create index if not exists portfolio_positions_owner_idx on public.portfolio_positions (user_id, symbol);
create index if not exists price_alerts_enabled_idx on public.price_alerts (user_id, enabled, symbol);

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.price_alerts enable row level security;

revoke all on public.profiles, public.watchlists, public.watchlist_items,
  public.portfolio_positions, public.price_alerts from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.watchlists to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;
grant select, insert, update, delete on public.portfolio_positions to authenticated;
grant select, insert, update, delete on public.price_alerts to authenticated;

create policy "profiles_select_self" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "watchlists_select_self" on public.watchlists
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlists_insert_self" on public.watchlists
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlists_update_self" on public.watchlists
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "watchlists_delete_self" on public.watchlists
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "watchlist_items_select_self" on public.watchlist_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlist_items_insert_self" on public.watchlist_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "watchlist_items_update_self" on public.watchlist_items
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "watchlist_items_delete_self" on public.watchlist_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "portfolio_positions_select_self" on public.portfolio_positions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolio_positions_insert_self" on public.portfolio_positions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolio_positions_update_self" on public.portfolio_positions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "portfolio_positions_delete_self" on public.portfolio_positions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "price_alerts_select_self" on public.price_alerts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "price_alerts_insert_self" on public.price_alerts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "price_alerts_update_self" on public.price_alerts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "price_alerts_delete_self" on public.price_alerts
  for delete to authenticated using ((select auth.uid()) = user_id);
