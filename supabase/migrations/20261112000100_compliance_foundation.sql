-- Northstar compliance foundations.
-- Safe to apply with approval disabled: it creates only Northstar compliance tables,
-- policies, and triggers. Keep signups paused until counsel approves the final policies.
-- This migration never grants users the ability to set their own paid entitlements.
create table if not exists public.legal_policy_config (
  singleton boolean primary key default true check (singleton),
  terms_version text,
  privacy_version text,
  approved boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.legal_policy_config (singleton, terms_version, privacy_version, approved)
values (true, null, null, false) on conflict (singleton) do nothing;
alter table public.legal_policy_config enable row level security;
revoke all on public.legal_policy_config from anon, authenticated;

create table if not exists public.signup_consent_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  terms_version text not null,
  privacy_version text not null,
  financial_information_acknowledged boolean not null check (financial_information_acknowledged),
  accepted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > accepted_at)
);
alter table public.signup_consent_tokens enable row level security;
revoke all on public.signup_consent_tokens from anon, authenticated;

-- The database is the hard enforcement point; hiding the signup button in the UI is not enough.
create or replace function public.enforce_northstar_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_row public.legal_policy_config%rowtype;
  consent_row public.signup_consent_tokens%rowtype;
  consent_token text;
begin
  select * into policy_row from public.legal_policy_config where singleton = true;
  if not found or not policy_row.approved or policy_row.terms_version is null or policy_row.privacy_version is null then
    raise exception 'Northstar account registration is paused pending policy approval';
  end if;
  consent_token := coalesce(new.raw_user_meta_data ->> 'northstar_consent_token_hash', '');
  if consent_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Current Northstar consent token is required';
  end if;
  select * into consent_row
  from public.signup_consent_tokens
  where token_hash = consent_token
    and used_at is null and expires_at > now()
  for update;
  if not found or consent_row.terms_version <> policy_row.terms_version or consent_row.privacy_version <> policy_row.privacy_version or not consent_row.financial_information_acknowledged then
    raise exception 'Current Northstar terms and privacy consent are required';
  end if;
  update public.signup_consent_tokens set used_at = now() where id = consent_row.id;
  return new;
end;
$$;
revoke all on function public.enforce_northstar_signup_consent() from public, anon, authenticated;
drop trigger if exists before_northstar_signup_consent on auth.users;
create trigger before_northstar_signup_consent
  before insert on auth.users
  for each row execute procedure public.enforce_northstar_signup_consent();

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  financial_information_acknowledged boolean not null,
  accepted_at timestamptz not null default now(),
  capture_method text not null default 'signup',
  check (char_length(terms_version) between 1 and 32),
  check (char_length(privacy_version) between 1 and 32)
);
create index if not exists user_consents_user_accepted_idx on public.user_consents (user_id, accepted_at desc);
alter table public.user_consents enable row level security;
revoke all on public.user_consents from anon, authenticated;
grant select on public.user_consents to authenticated;
drop policy if exists "user_consents_select_self" on public.user_consents;
create policy "user_consents_select_self" on public.user_consents
  for select to authenticated using ((select auth.uid()) = user_id);

-- Record the exact policy versions accepted at signup. Client-editable user metadata
-- is copied once as an audit record; it is never used for authorization decisions.
create or replace function public.record_northstar_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_terms text;
  accepted_privacy text;
  financial_ack boolean;
begin
  insert into public.user_entitlements (user_id, tier, status)
  values (new.id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  select terms_version, privacy_version, financial_information_acknowledged
  into accepted_terms, accepted_privacy, financial_ack
  from public.signup_consent_tokens
  where token_hash = new.raw_user_meta_data ->> 'northstar_consent_token_hash';
  if accepted_terms is not null and accepted_privacy is not null and financial_ack then
    insert into public.user_consents (user_id, terms_version, privacy_version, financial_information_acknowledged)
    values (new.id, accepted_terms, accepted_privacy, true);
  end if;
  return new;
end;
$$;
revoke all on function public.record_northstar_signup_consent() from public, anon, authenticated;
drop trigger if exists on_northstar_signup_consent on auth.users;
create trigger on_northstar_signup_consent
  after insert on auth.users
  for each row execute procedure public.record_northstar_signup_consent();

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus')),
  status text not null default 'inactive' check (status in ('active', 'inactive', 'past_due', 'trialing', 'canceled')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_entitlements enable row level security;
revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;
drop policy if exists "user_entitlements_select_self" on public.user_entitlements;
create policy "user_entitlements_select_self" on public.user_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.shared_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  snapshot jsonb not null check (octet_length(snapshot::text) <= 12000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists shared_briefs_owner_created_idx on public.shared_briefs (owner_id, created_at desc);
create index if not exists shared_briefs_expiry_idx on public.shared_briefs (expires_at) where revoked_at is null;
alter table public.shared_briefs enable row level security;
revoke all on public.shared_briefs from anon, authenticated;
grant select, delete on public.shared_briefs to authenticated;
drop policy if exists "shared_briefs_select_owner" on public.shared_briefs;
create policy "shared_briefs_select_owner" on public.shared_briefs
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "shared_briefs_delete_owner" on public.shared_briefs;
create policy "shared_briefs_delete_owner" on public.shared_briefs
  for delete to authenticated using ((select auth.uid()) = owner_id);
-- Insert/revoke/public retrieval happen only through server endpoints using a secret key.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_code text
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.legal_policy_config, public.signup_consent_tokens, public.user_consents,
  public.user_entitlements, public.shared_briefs, public.stripe_webhook_events to service_role;

-- Seed every existing account with a free entitlement without overwriting any current value.
insert into public.user_entitlements (user_id, tier, status)
select id, 'free', 'inactive' from auth.users
on conflict (user_id) do nothing;
