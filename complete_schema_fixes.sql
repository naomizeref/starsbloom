-- =============================================================================
-- MASTER MIGRATION: ALL MISSING TABLES & SCHEMA COLUMN FIXES
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- Safe to re-run multiple times (idempotent).
-- =============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TRANSACTIONS FIX: add occurred_at column if missing
-- -----------------------------------------------------------------------------
alter table if exists public.transactions
  add column if not exists occurred_at timestamptz default now();

-- -----------------------------------------------------------------------------
-- 2. ANNOUNCEMENTS FIX: add extended columns & fix priority type
-- -----------------------------------------------------------------------------
alter table if exists public.announcements
  add column if not exists pinned boolean default false,
  add column if not exists enabled boolean default true,
  add column if not exists publish_date text,
  add column if not exists expiry_date text,
  add column if not exists scheduled_date text;

-- Ensure priority is text rather than integer
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements' and column_name = 'priority'
  ) then
    alter table public.announcements alter column priority drop default;
    alter table public.announcements
      alter column priority type text
      using (
        case priority::text
          when '0' then 'Normal'
          when '1' then 'Important'
          when '2' then 'Critical'
          else coalesce(nullif(priority::text, ''), 'Normal')
        end
      );
    alter table public.announcements alter column priority set default 'Normal';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. PORTFOLIO_ASSETS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.portfolio_assets (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  amount numeric not null default 0,
  avg_buy_price numeric not null default 0,
  current_price numeric not null default 0,
  type text not null default 'crypto',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_portfolio_assets_user on public.portfolio_assets(user_id);
create index if not exists idx_portfolio_assets_symbol on public.portfolio_assets(user_id, symbol);

alter table public.portfolio_assets enable row level security;

drop policy if exists "portfolio_assets_select" on public.portfolio_assets;
create policy "portfolio_assets_select" on public.portfolio_assets
  for select
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) or public.is_admin());

drop policy if exists "portfolio_assets_insert" on public.portfolio_assets;
create policy "portfolio_assets_insert" on public.portfolio_assets
  for insert
  with check (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) or public.is_admin());

drop policy if exists "portfolio_assets_update" on public.portfolio_assets;
create policy "portfolio_assets_update" on public.portfolio_assets
  for update
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) or public.is_admin());

drop policy if exists "portfolio_assets_delete" on public.portfolio_assets;
create policy "portfolio_assets_delete" on public.portfolio_assets
  for delete
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) or public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. MARKET_PRICES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.market_prices (
  symbol text primary key,
  price numeric not null check (price > 0),
  updated_at timestamptz not null default now()
);

alter table public.market_prices enable row level security;

drop policy if exists "market_prices_select" on public.market_prices;
create policy "market_prices_select" on public.market_prices for select using (true);

-- -----------------------------------------------------------------------------
-- 5. AIRDROPS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.airdrops (
  id text primary key,
  title text not null,
  token text not null,
  reward_amount text not null,
  status text not null default 'Active',
  enabled boolean not null default true,
  claim_limit integer,
  start_date text,
  end_date text,
  eligibility text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.airdrops enable row level security;

drop policy if exists "airdrops_select" on public.airdrops;
create policy "airdrops_select" on public.airdrops for select using (true);

drop policy if exists "airdrops_insert" on public.airdrops;
create policy "airdrops_insert" on public.airdrops for insert with check (public.is_admin());

drop policy if exists "airdrops_update" on public.airdrops;
create policy "airdrops_update" on public.airdrops for update using (public.is_admin());

drop policy if exists "airdrops_delete" on public.airdrops;
create policy "airdrops_delete" on public.airdrops for delete using (public.is_admin());

-- Seed sample airdrop campaigns if empty
insert into public.airdrops (id, title, token, reward_amount, status, enabled, description, eligibility)
values
  ('airdrop-1', 'Bloom Genesis Community Airdrop', 'BLM', '500', 'Active', true, 'Early adopter reward for active platform participants.', 'Open to all verified users'),
  ('airdrop-2', 'Tier 1 Stakers Exclusive', 'USDT', '50', 'Active', true, 'Bonus distribution for active investment plan holders.', 'Hold at least 1 active investment plan')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 6. AIRDROP_CLAIMS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.airdrop_claims (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  airdrop_id text not null references public.airdrops(id) on delete cascade,
  campaign_title text,
  token text not null,
  reward_amount text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  admin_notes text,
  payout_transaction_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_airdrop_claims_user_id on public.airdrop_claims(user_id);
create index if not exists idx_airdrop_claims_airdrop_id on public.airdrop_claims(airdrop_id);

alter table public.airdrop_claims enable row level security;

drop policy if exists "airdrop_claims_select" on public.airdrop_claims;
create policy "airdrop_claims_select" on public.airdrop_claims
  for select
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) or public.is_admin());

drop policy if exists "airdrop_claims_insert" on public.airdrop_claims;
create policy "airdrop_claims_insert" on public.airdrop_claims
  for insert
  with check (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text) and status = 'Pending');

-- -----------------------------------------------------------------------------
-- 7. SITE_CONTENT & APP_SETTINGS TABLES
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

alter table public.site_content enable row level security;

drop policy if exists "Anyone can read site_content" on public.site_content;
create policy "Anyone can read site_content" on public.site_content for select using (true);

drop policy if exists "Admins can insert site_content" on public.site_content;
create policy "Admins can insert site_content" on public.site_content for insert with check (public.is_admin());

drop policy if exists "Admins can update site_content" on public.site_content;
create policy "Admins can update site_content" on public.site_content for update using (public.is_admin());

drop policy if exists "Admins can delete site_content" on public.site_content;
create policy "Admins can delete site_content" on public.site_content for delete using (public.is_admin());

insert into public.site_content (key, value)
values (
  'texts',
  '{
    "hero_title": "Grow Your Wealth with Bloom",
    "hero_subtitle": "Start investing today with expert-guided plans",
    "hero_button": "Get Started",
    "dashboard_title": "Dashboard",
    "dashboard_description": "Manage your investments and track performance",
    "investment_title": "Investment Plans",
    "investment_description": "Choose from our curated investment plans",
    "footer_text": "© 2026 Bloom. All rights reserved.",
    "announcement_text": "",
    "faq_question_1": "How do I get started?",
    "faq_answer_1": "Create an account and choose an investment plan.",
    "faq_question_2": "Is my money safe?",
    "faq_answer_2": "We use industry-standard security practices.",
    "faq_question_3": "How do I withdraw?",
    "faq_answer_3": "Navigate to your wallet and submit a withdrawal request."
  }'::jsonb
)
on conflict (key) do nothing;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

alter table public.app_settings enable row level security;

drop policy if exists "Anyone can read app_settings" on public.app_settings;
create policy "Anyone can read app_settings" on public.app_settings for select using (true);

drop policy if exists "Admins can insert app_settings" on public.app_settings;
create policy "Admins can insert app_settings" on public.app_settings for insert with check (public.is_admin());

drop policy if exists "Admins can update app_settings" on public.app_settings;
create policy "Admins can update app_settings" on public.app_settings for update using (public.is_admin());

drop policy if exists "Admins can delete app_settings" on public.app_settings;
create policy "Admins can delete app_settings" on public.app_settings for delete using (public.is_admin());

insert into public.app_settings (key, value)
values (
  'business',
  '{
    "companyName": "Bloom",
    "supportEmail": "support@bloomsinvest.co",
    "supportPhone": "",
    "companyAddress": "",
    "senderName": "Bloom",
    "replyToEmail": "support@bloomsinvest.co",
    "chatwayWidgetId": ""
  }'::jsonb
)
on conflict (key) do nothing;
