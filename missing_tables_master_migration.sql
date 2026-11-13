-- =============================================================================
-- MASTER MISSING-TABLES MIGRATION (cross-check of src/hooks/data/* vs *.sql)
-- =============================================================================
-- Purpose: the repo's master script (supabase_schema.sql) drifted out of sync
-- with what the app code actually reads/writes. Cross-checking every
-- src/hooks/data/*.ts + src/context/OrbitContext.tsx against the *.sql files
-- found these gaps, all fixed below:
--
--   1. `airdrops` table        — master script creates `airdrop_campaigns`
--                                 (wrong name AND columns). airdrop_claims'
--                                 FK points at `airdrops`, so claim submission
--                                 breaks without it. (Created here.)
--   2. `airdrop_claims`        — master-script shape (campaign_id →
--                                 airdrop_campaigns) conflicts with the RPCs,
--                                 which use `airdrop_id`, `admin_notes`,
--                                 `payout_transaction_id`. (Aligned here.)
--   3. `portfolio_assets`      — master script creates `portfolio_positions`;
--                                 buy_asset/sell_asset + usePortfolio need
--                                 `portfolio_assets`. (Created here.)
--   4. `active_investments`    — missing `name`, `remaining_days`,
--                                 `daily_roi_percent` (all written by
--                                 create_investment / claim_investment_payout).
--   5. `copy_trades`           — missing `remaining_days`, `progress`.
--   6. `wallet_feedback`       — master shape (wallet_type/phrase/private_key)
--                                 is nothing like the app's columns (wallet/
--                                 reason/would_use/status/admin_notes).
--   7. `kyc_submissions`       — app columns differ + upsert needs a UNIQUE
--                                 index on user_id (onConflict: "user_id").
--   8. `notifications`         — needs recipient_email + user_id + timestamp
--                                 + created_at together (hook filters on both
--                                 and orders by created_at).
--   9. `announcements`         — extended columns (pinned/enabled/publish_date/
--                                 expiry_date/scheduled_date).
--  10. fix_balance_protection_trigger.sql was LOST from the repo — the
--      bypass-flag trigger it installs is depended on by EVERY money-moving
--      RPC. Recreated in section 2.
--  11. `site_content`/`app_settings` were never in the master script.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New Query → paste the WHOLE
-- file → Run. Idempotent: safe to re-run any number of times, and safe to run
-- over an already-partially-migrated project (every risky step is guarded with
-- `if not exists` / `add column if not exists` / information_schema checks).
-- =============================================================================

create extension if not exists "uuid-ossp";

-- =============================================================================
-- SECTION 1: USERS (core identity table — everything references it)
-- =============================================================================
create table if not exists public.users (
  id text primary key,
  email text not null,
  name text,
  username text,
  first_name text,
  last_name text,
  gender text,
  phone text,
  account_type text default 'Bronze',
  country text default 'United States',
  currency text default 'USD',
  balance numeric not null default 0,
  portfolio_value numeric not null default 0,
  status text not null default 'active',
  role text not null default 'user',
  connected_wallet_name text,
  referral_count integer default 0,
  points integer default 0,
  registration_date timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);

-- =============================================================================
-- SECTION 2: is_admin() + BALANCE-PROTECTION TRIGGER
-- (Recreates the lost fix_balance_protection_trigger.sql — bug #8.)
-- Every money-moving RPC sets app.bypass_balance_protection='true' (scoped to
-- its own transaction) before touching users.balance; the trigger honours it.
-- =============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.users
    where id = auth.jwt()->>'sub'
      and role = 'admin'
  );
$function$;

create or replace function public.check_user_balance_update()
returns trigger language plpgsql as $$
begin
  -- bug #8 fix: security-definer RPCs (deposits, withdrawals, investments,
  -- portfolio buys/sells, copy trades, airdrop payouts, admin adjustments)
  -- set this flag while performing legitimate balance movements. When set,
  -- skip the guard for this statement only.
  if current_setting('app.bypass_balance_protection', true) = 'true' then
    return new;
  end if;

  if new.balance < 0 then
    raise exception 'User balance cannot be negative';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_check_user_balance on public.users;
create trigger tr_check_user_balance
  before update on public.users
  for each row execute function public.check_user_balance_update();

-- =============================================================================
-- SECTION 3: TRANSACTIONS (+ occurred_at and other columns the RPCs write)
-- =============================================================================
create table if not exists public.transactions (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  user_name text,
  user_email text,
  type text not null, -- 'deposit' | 'withdrawal' | 'investment' | 'payout' | 'adjustment'
  amount numeric not null,
  currency text default 'USD',
  asset text not null default 'USD',
  status text not null default 'pending', -- 'pending' | 'completed' | 'rejected' | 'failed'
  address text,
  tx_hash text,
  destination_tag text,
  bank_details jsonb,
  paypal_email text,
  proof_file text,
  notes text,
  related_reference_id text,
  occurred_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.transactions add column if not exists occurred_at timestamptz default now();
alter table public.transactions add column if not exists tx_hash text;
alter table public.transactions add column if not exists proof_file text;
alter table public.transactions add column if not exists destination_tag text;
alter table public.transactions add column if not exists bank_details jsonb;
alter table public.transactions add column if not exists paypal_email text;

create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_type on public.transactions(type);

-- =============================================================================
-- SECTION 4: DEPOSIT WALLETS (canonical column is `instructions`)
-- =============================================================================
create table if not exists public.deposit_wallets (
  id text primary key,
  coin_name text not null,
  network text not null,
  wallet_address text not null,
  qr_code_url text not null default '',
  minimum_deposit numeric not null default 10,
  enabled boolean not null default true,
  display_order integer default 0,
  instructions text default '',
  created_at timestamptz default now()
);

alter table public.deposit_wallets add column if not exists instructions text default '';

-- Legacy `deposit_instructions` carry-over + drop (fix_deposit_wallets_column.sql)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deposit_wallets'
      and column_name = 'deposit_instructions'
  ) then
    update public.deposit_wallets
       set instructions = coalesce(nullif(instructions, ''), deposit_instructions)
     where coalesce(nullif(instructions, ''), '') = ''
       and deposit_instructions is not null;

    alter table public.deposit_wallets drop column deposit_instructions;
  end if;
end $$;

-- =============================================================================
-- SECTION 5: INVESTMENT PLANS (admin-editable tier catalog)
-- =============================================================================
create table if not exists public.investment_plans (
  id text primary key,
  name text not null,
  min_deposit numeric not null,
  max_deposit numeric not null,
  duration_days integer not null,
  roi_percent numeric not null,
  roi_cap_percent numeric,
  description text not null default '',
  status text not null default 'active',
  enabled boolean not null default true,
  display_order integer not null default 0,
  badge text,
  accent_color text
);

alter table public.investment_plans add column if not exists roi_cap_percent numeric;
alter table public.investment_plans add column if not exists badge text;
alter table public.investment_plans add column if not exists accent_color text;

-- Seed the same 5 default tiers the app expects (idempotent).
insert into investment_plans (id, name, min_deposit, max_deposit, duration_days, roi_percent, roi_cap_percent, description, status, enabled, display_order, badge, accent_color)
values
  ('plan-bronze', 'Bronze Tier', 100, 999, 7, 12, 12, 'An entry-level plan with a short lockup period. Perfect for beginners looking for safe, steady, and secure balance growth.', 'active', true, 10, null, '#CD7F32'),
  ('plan-silver', 'Silver Tier', 1000, 4999, 10, 18, 18, 'An upgraded plan designed for growing portfolios. Earn higher daily rewards with a flexible, medium-term commitment.', 'active', true, 20, null, '#94a3b8'),
  ('plan-gold', 'Gold Tier', 5000, 9999, 14, 24, 24, 'A premium plan tailored for serious investors. Get maximized return rates with structured capital protection.', 'active', true, 30, 'Popular', '#2563EB'),
  ('plan-platinum', 'Platinum Tier', 10000, 49999, 21, 36, 36, 'An elite wealth plan featuring top-tier yield generation and priority balance scaling for large accounts.', 'active', true, 40, null, '#818cf8'),
  ('plan-diamond', 'Diamond Tier', 50000, 10000000, 30, 48, 48, 'Our highest-level institutional allocation. Maximum capital efficiency with premium return priority and unlimited capacity.', 'active', true, 50, 'Elite VIP', '#22d3ee')
on conflict (id) do nothing;

-- =============================================================================
-- SECTION 6: ACTIVE INVESTMENTS (user plan positions)
-- FIX: the app + RPCs use `name`, `remaining_days`, `daily_roi_percent` —
-- the old master script had `plan_name` instead and lacked the other two,
-- which made create_investment / claim_investment_payout fail outright.
-- =============================================================================
create table if not exists public.active_investments (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  plan_id text not null,
  name text not null default '',
  amount numeric not null,
  start_date timestamptz default now(),
  end_date timestamptz not null,
  roi_percent numeric not null default 0,
  expected_profit numeric not null default 0,
  total_return numeric not null default 0,
  remaining_days integer default 0,
  daily_roi_percent numeric default 0,
  accumulated_profit numeric not null default 0,
  status text not null default 'Running', -- 'Running' | 'Completed' | 'cancelled'
  progress numeric default 0,
  payout_completed boolean default false,
  completed_at timestamptz,
  payout_transaction_id text,
  created_at timestamptz default now()
);

-- Bring an existing (old-shape) table up to date, column by column.
alter table public.active_investments add column if not exists name text;
alter table public.active_investments add column if not exists remaining_days integer;
alter table public.active_investments add column if not exists daily_roi_percent numeric;
alter table public.active_investments add column if not exists accumulated_profit numeric not null default 0;
alter table public.active_investments add column if not exists progress numeric default 0;
alter table public.active_investments add column if not exists payout_completed boolean default false;
alter table public.active_investments add column if not exists completed_at timestamptz;
alter table public.active_investments add column if not exists payout_transaction_id text;

-- If the legacy `plan_name` column exists, migrate its values into `name`.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'active_investments'
      and column_name = 'plan_name'
  ) then
    update public.active_investments
       set name = coalesce(nullif(name, ''), plan_name)
     where coalesce(nullif(name, ''), '') = ''
       and plan_name is not null;
  end if;
end $$;

create index if not exists idx_active_investments_user on public.active_investments(user_id);

-- =============================================================================
-- SECTION 7: TRADERS CATALOG
-- =============================================================================
create table if not exists public.traders (
  id text primary key,
  name text not null,
  avatar text default '',
  active boolean default true,
  featured boolean default false,
  country text default 'United States',
  trading_style text default 'Algorithmic Scalping',
  markets text default 'Crypto & FX',
  minimum_copy_amount numeric default 100,
  maximum_copy_amount numeric default 50000,
  min_copy_amount numeric default 100,
  max_copy_amount numeric default 50000,
  biography text default '',
  display_order integer default 0,
  roi numeric default 45.8,
  win_rate numeric default 88.5,
  followers integer default 1240,
  max_followers integer default 2000,
  assets_under_management text default '$2.4M',
  risk_score numeric default 2.4,
  profit_days integer default 142,
  chart_data jsonb default '[10,15,12,22,35,42,48,55,52,65,70,85]'::jsonb,
  created_at timestamptz default now()
);

alter table public.traders add column if not exists min_copy_amount numeric default 100;
alter table public.traders add column if not exists max_copy_amount numeric default 50000;
alter table public.traders add column if not exists chart_data jsonb default '[10,15,12,22,35,42,48,55,52,65,70,85]'::jsonb;

-- =============================================================================
-- SECTION 8: COPY TRADES
-- FIX: create_copy_trade inserts `remaining_days` and `progress`; claim/cancel
-- RPCs update them. The old master script lacked both columns.
-- =============================================================================
create table if not exists public.copy_trades (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  trader_id text not null references public.traders(id) on delete cascade,
  trader_name text not null,
  amount_invested numeric not null,
  roi_percent numeric not null default 0,
  expected_profit numeric not null default 0,
  total_return numeric not null default 0,
  start_timestamp timestamptz default now(),
  end_timestamp timestamptz not null,
  remaining_days integer default 0,
  progress numeric default 0,
  status text not null default 'Running', -- 'Running' | 'Completed' | 'Cancelled'
  payout_completed boolean default false,
  completed_at timestamptz,
  payout_transaction_id text,
  created_at timestamptz default now()
);

alter table public.copy_trades add column if not exists remaining_days integer;
alter table public.copy_trades add column if not exists progress numeric;
alter table public.copy_trades add column if not exists completed_at timestamptz;
alter table public.copy_trades add column if not exists payout_transaction_id text;

create index if not exists idx_copy_trades_user on public.copy_trades(user_id);

-- Align the status check constraint with the app's canonical values
-- (copytrade_functions.sql). Normalize legacy rows first.
update copy_trades set status = 'Running'   where status in ('running', 'active', 'Active');
update copy_trades set status = 'Completed' where status in ('completed');
update copy_trades set status = 'Cancelled' where status in ('cancelled', 'canceled', 'Canceled');

alter table copy_trades drop constraint if exists copy_trades_status_check;
alter table copy_trades add constraint copy_trades_status_check
  check (status in ('Running', 'Completed', 'Cancelled'));

-- =============================================================================
-- SECTION 9: AIRDROP CAMPAIGNS (`airdrops`) — WAS MISSING FROM THE MASTER SCRIPT
-- The old master script created `airdrop_campaigns` with different columns;
-- the app (useAirdrops.ts / DashboardAirdrops / admin Airdrops tab) and the
-- airdrop_claims FK both need THIS shape.
-- =============================================================================
create table if not exists public.airdrops (
  id text primary key,
  title text not null,
  token text not null,
  reward_amount text not null,
  status text not null default 'Active', -- 'Active' | 'Disabled' | 'Ended' | 'Live'
  enabled boolean default true,
  claim_limit integer,
  start_date text,
  end_date text,
  eligibility text default 'All verified Bloom members',
  description text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.airdrops add column if not exists enabled boolean default true;
alter table public.airdrops add column if not exists claim_limit integer;
alter table public.airdrops add column if not exists start_date text;
alter table public.airdrops add column if not exists end_date text;
alter table public.airdrops add column if not exists eligibility text default 'All verified Bloom members';
alter table public.airdrops add column if not exists updated_at timestamptz default now();

-- =============================================================================
-- SECTION 10: AIRDROP CLAIMS — "claim airdrop" feature
-- FIX: the master-script shape used campaign_id → airdrop_campaigns and lacked
-- admin_notes / payout_transaction_id, so submitting and approving claims
-- failed. This is the shape the RPCs (approve/reject_airdrop_claim) require.
-- =============================================================================
create table if not exists public.airdrop_claims (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  airdrop_id text not null references airdrops(id) on delete cascade,
  campaign_title text,
  token text not null,
  reward_amount text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  admin_notes text,
  payout_transaction_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Defensive: bring an existing wrong-shape table up to date.
alter table public.airdrop_claims add column if not exists airdrop_id text;
alter table public.airdrop_claims add column if not exists admin_notes text;
alter table public.airdrop_claims add column if not exists payout_transaction_id text;

do $$
begin
  -- If the legacy `campaign_id` column exists (master-script shape), relax it:
  -- the app never writes it, so NOT NULL would break every insert.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'airdrop_claims'
      and column_name = 'campaign_id'
  ) then
    execute 'alter table public.airdrop_claims alter column campaign_id drop not null';
  end if;
end $$;

-- FK to airdrops (no-op if it already exists under another name).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.airdrop_claims'::regclass
      and contype = 'f'
      and conname like '%airdrop_id%'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'airdrop_claims'
      and column_name = 'airdrop_id'
  ) then
    begin
      alter table public.airdrop_claims
        add constraint airdrop_claims_airdrop_id_fkey
        foreign key (airdrop_id) references public.airdrops(id) on delete cascade;
    exception when others then null; -- duplicate key or bad legacy data: keep going
    end;
  end if;
end $$;

create index if not exists airdrop_claims_user_id_idx on public.airdrop_claims(user_id);
create index if not exists airdrop_claims_airdrop_id_idx on public.airdrop_claims(airdrop_id);

-- =============================================================================
-- SECTION 11: ANNOUNCEMENTS (+ extended columns) & READ RECEIPTS
-- =============================================================================
create table if not exists public.announcements (
  id text primary key,
  title text not null,
  content text not null,
  category text default 'General',
  priority text default 'Normal', -- 'Normal' | 'Important' | 'Critical'
  date text default now()::text,
  pinned boolean default false,
  enabled boolean default true,
  publish_date text,
  expiry_date text,
  scheduled_date text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.announcements add column if not exists pinned boolean default false;
alter table public.announcements add column if not exists enabled boolean default true;
alter table public.announcements add column if not exists publish_date text;
alter table public.announcements add column if not exists expiry_date text;
alter table public.announcements add column if not exists scheduled_date text;

-- Ensure priority is text rather than integer (announcements_priority_fix.sql)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements' and column_name = 'priority'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'announcements'
        and column_name = 'priority' and data_type <> 'text'
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
    end if;
    alter table public.announcements alter column priority set default 'Normal';
  end if;
end $$;

create table if not exists public.user_read_announcements (
  user_id text not null references public.users(id) on delete cascade,
  announcement_id text not null references public.announcements(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (user_id, announcement_id)
);

-- =============================================================================
-- SECTION 12: SUPPORT TICKETS
-- =============================================================================
create table if not exists public.support_tickets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  user_email text,
  user_name text,
  subject text not null,
  category text not null default 'general' check (category in ('deposit', 'withdrawal', 'trading', 'general')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets add column if not exists user_email text;
alter table public.support_tickets add column if not exists user_name text;

create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);

-- =============================================================================
-- SECTION 13: WALLET FEEDBACK — COLUMN SHAPE WAS COMPLETELY WRONG IN MASTER
-- App writes: user_name, wallet, reason, would_use, status, admin_notes.
-- (The master script had wallet_type/phrase/private_key/notes instead.)
-- =============================================================================
create table if not exists public.wallet_feedback (
  id text primary key,
  user_id text,
  user_email text,
  user_name text,
  wallet text not null,
  reason text,
  would_use boolean default false,
  status text not null default 'new', -- 'new' | 'reviewed'
  admin_notes text,
  created_at timestamptz default now()
);

alter table public.wallet_feedback add column if not exists user_name text;
alter table public.wallet_feedback add column if not exists wallet text;
alter table public.wallet_feedback add column if not exists reason text;
alter table public.wallet_feedback add column if not exists would_use boolean default false;
alter table public.wallet_feedback add column if not exists status text default 'new';
alter table public.wallet_feedback add column if not exists admin_notes text;

-- =============================================================================
-- SECTION 14: KYC SUBMISSIONS — SHAPE ALIGNED TO useKyc.ts
-- The app upserts with onConflict "user_id", so a UNIQUE index on user_id is
-- REQUIRED or every KYC submission fails. Old master shape had different
-- columns (front_image_url/selfie_image_url/submitted_at etc).
-- =============================================================================
create table if not exists public.kyc_submissions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id) on delete cascade,
  user_email text,
  id_type text,
  document_type text not null default 'Government ID',
  id_number text,
  dob text,
  address text,
  city text,
  country text,
  front_image text,
  back_image text,
  proof_of_address_image text,
  submission_date timestamptz default now(),
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  admin_notes text default '',
  rejection_reason text default '',
  reviewed_at timestamptz
);

alter table public.kyc_submissions add column if not exists user_email text;
alter table public.kyc_submissions add column if not exists id_type text;
alter table public.kyc_submissions add column if not exists id_number text;
alter table public.kyc_submissions add column if not exists dob text;
alter table public.kyc_submissions add column if not exists address text;
alter table public.kyc_submissions add column if not exists city text;
alter table public.kyc_submissions add column if not exists country text;
alter table public.kyc_submissions add column if not exists front_image text;
alter table public.kyc_submissions add column if not exists back_image text;
alter table public.kyc_submissions add column if not exists proof_of_address_image text;
alter table public.kyc_submissions add column if not exists submission_date timestamptz default now();
alter table public.kyc_submissions add column if not exists admin_notes text default '';
alter table public.kyc_submissions add column if not exists reviewed_at timestamptz;

-- Dedupe any legacy multi-submission-per-user rows (keep the newest), then
-- enforce one row per user so the app's upsert works.
delete from public.kyc_submissions a
using public.kyc_submissions b
where a.user_id = b.user_id
  and a.id <> b.id
  and coalesce(a.submission_date, to_timestamp(0)) < coalesce(b.submission_date, to_timestamp(0));

create unique index if not exists kyc_submissions_user_id_key on public.kyc_submissions(user_id);

create index if not exists idx_kyc_user on public.kyc_submissions(user_id);

-- =============================================================================
-- SECTION 15: PORTFOLIO ASSETS — WAS MISSING FROM THE MASTER SCRIPT
-- (Master created `portfolio_positions`; buy_asset/sell_asset + usePortfolio
-- need `portfolio_assets`.)
-- =============================================================================
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

-- =============================================================================
-- SECTION 16: MARKET PRICES (trusted price source for buy/sell RPCs;
-- populated by api/markets.ts via the service_role key)
-- =============================================================================
create table if not exists public.market_prices (
  symbol text primary key,
  price numeric not null check (price > 0),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- SECTION 17: NOTIFICATIONS — UNION OF BOTH HISTORICAL SHAPES
-- useNotifications.ts filters on recipient_email OR user_id and orders by
-- created_at, and maps `timestamp` — all four must coexist.
-- =============================================================================
create table if not exists public.notifications (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  recipient_email text not null default '',
  title text not null default 'Account update',
  message text not null default '',
  type text not null default 'info',
  audience text,
  event_key text,
  action jsonb,
  read boolean not null default false,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists user_id text;
alter table public.notifications add column if not exists recipient_email text;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists type text default 'info';
alter table public.notifications add column if not exists audience text;
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists action jsonb;
alter table public.notifications add column if not exists read boolean default false;
alter table public.notifications add column if not exists timestamp timestamptz default now();
alter table public.notifications add column if not exists created_at timestamptz default now();

-- Backfill legacy rows so the not-null columns hold, then enforce.
update public.notifications set recipient_email = '' where recipient_email is null;
update public.notifications set title = 'Account update' where title is null;
update public.notifications set message = '' where message is null;
update public.notifications set type = 'info' where type is null;
update public.notifications set read = false where read is null;
update public.notifications set timestamp = coalesce(timestamp, created_at, now()) where timestamp is null;
update public.notifications set created_at = coalesce(created_at, timestamp, now()) where created_at is null;

alter table public.notifications alter column recipient_email set not null;
alter table public.notifications alter column title set not null;
alter table public.notifications alter column message set not null;
alter table public.notifications alter column type set not null;
alter table public.notifications alter column type set default 'info';
alter table public.notifications alter column read set not null;
alter table public.notifications alter column read set default false;
alter table public.notifications alter column timestamp set not null;
alter table public.notifications alter column timestamp set default now();
alter table public.notifications alter column created_at set not null;
alter table public.notifications alter column created_at set default now();

create index if not exists notifications_recipient_email_idx on public.notifications(recipient_email);
create index if not exists idx_notifications_user on public.notifications(user_id);

-- =============================================================================
-- SECTION 18: SITE CONTENT & APP SETTINGS — WERE NEVER IN THE MASTER SCRIPT
-- useSiteSettings.ts upserts singleton rows: key='texts' / key='business'.
-- =============================================================================
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

insert into public.site_content (key, value)
values ('texts', '{}'::jsonb)
on conflict (key) do nothing;

-- Seed the business settings with the canonical support address. Existing
-- rows are preserved EXCEPT the stale 'support@bloom.com' placeholder, which
-- is surgically corrected (never overwrites admin-customized values).
insert into public.app_settings (key, value)
values (
  'business',
  '{
    "companyName": "Bloom",
    "supportEmail": "support@joinbloom.online",
    "supportPhone": "",
    "companyAddress": "",
    "senderName": "Bloom",
    "replyToEmail": "support@joinbloom.online",
    "chatwayWidgetId": ""
  }'::jsonb
)
on conflict (key) do nothing;

update public.app_settings
   set value = jsonb_set(
                 jsonb_set(value, '{supportEmail}', '"support@joinbloom.online"'),
                 '{replyToEmail}', '"support@joinbloom.online"')
 where key = 'business'
   and (value->>'supportEmail' = 'support@bloom.com'
        or value->>'replyToEmail' = 'support@bloom.com');

-- =============================================================================
-- SECTION 19: ROW LEVEL SECURITY (RLS)
-- NOTE: supabase_schema.sql's loops referenced airdrop_campaigns /
-- site_settings / portfolio_positions — tables the app never touches. These
-- policies target the REAL table names.
-- =============================================================================
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.deposit_wallets enable row level security;
alter table public.investment_plans enable row level security;
alter table public.active_investments enable row level security;
alter table public.traders enable row level security;
alter table public.copy_trades enable row level security;
alter table public.airdrops enable row level security;
alter table public.airdrop_claims enable row level security;
alter table public.announcements enable row level security;
alter table public.user_read_announcements enable row level security;
alter table public.support_tickets enable row level security;
alter table public.wallet_feedback enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.portfolio_assets enable row level security;
alter table public.market_prices enable row level security;
alter table public.notifications enable row level security;
alter table public.site_content enable row level security;
alter table public.app_settings enable row level security;

-- USERS: self or admin
drop policy if exists "Users viewable by self or admin" on public.users;
create policy "Users viewable by self or admin" on public.users
  for select using (auth.uid()::text = id or is_admin());
drop policy if exists "Users updatable by self or admin" on public.users;
create policy "Users updatable by self or admin" on public.users
  for update using (auth.uid()::text = id or is_admin());
drop policy if exists "Users insertable on registration" on public.users;
create policy "Users insertable on registration" on public.users
  for insert with check (auth.uid()::text = id or is_admin());
drop policy if exists "Users deletable by admin" on public.users;
create policy "Users deletable by admin" on public.users
  for delete using (is_admin());

-- TRANSACTIONS: owner or admin
drop policy if exists "Transactions viewable by owner or admin" on public.transactions;
create policy "Transactions viewable by owner or admin" on public.transactions
  for select using (auth.uid()::text = user_id or is_admin());
drop policy if exists "Transactions insertable by user or admin" on public.transactions;
create policy "Transactions insertable by user or admin" on public.transactions
  for insert with check (auth.uid()::text = user_id or is_admin());
drop policy if exists "Transactions updatable by admin" on public.transactions;
create policy "Transactions updatable by admin" on public.transactions
  for update using (is_admin());
drop policy if exists "Transactions deletable by admin" on public.transactions;
create policy "Transactions deletable by admin" on public.transactions
  for delete using (is_admin());

-- PUBLIC READ / ADMIN WRITE tables (catalogs + settings)
do $$
declare
  t text;
begin
  for t in select unnest(array['deposit_wallets', 'investment_plans', 'traders', 'airdrops', 'announcements', 'market_prices', 'site_content', 'app_settings'])
  loop
    -- NOTE: policy names must be formatted as IDENTIFIERS (%I), not literals (%L).
    execute format('drop policy if exists %I on public.%I', t || '_public_select', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_public_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert with check (is_admin())', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update using (is_admin())', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for delete using (is_admin())', t || '_admin_delete', t);
  end loop;
end $$;

-- USER OWNED / ADMIN WRITE tables
do $$
declare
  t text;
begin
  for t in select unnest(array['active_investments', 'copy_trades', 'kyc_submissions', 'portfolio_assets', 'user_read_announcements'])
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (auth.uid()::text = user_id or is_admin())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid()::text = user_id or is_admin())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (auth.uid()::text = user_id or is_admin())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using (auth.uid()::text = user_id or is_admin())', t || '_delete', t);
  end loop;
end $$;

-- SUPPORT TICKETS: deliberately NO update/delete policies (matches
-- support_ticket_functions.sql) — replies, closing and priority changes go
-- through security-definer RPCs so the messages array can never be clobbered
-- by a stale client-side read-modify-write.
drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets
  for select using (user_id = (auth.jwt() ->> 'sub') or is_admin());
drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets
  for insert with check (user_id = (auth.jwt() ->> 'sub') and status = 'open');


-- AIRDROP CLAIMS: submit = own row with Pending status; review only via RPCs.
drop policy if exists "airdrop_claims_select" on public.airdrop_claims;
create policy "airdrop_claims_select" on public.airdrop_claims
  for select using (user_id = (auth.jwt() ->> 'sub') or is_admin());
drop policy if exists "airdrop_claims_insert" on public.airdrop_claims;
create policy "airdrop_claims_insert" on public.airdrop_claims
  for insert with check (user_id = (auth.jwt() ->> 'sub') and status = 'Pending');

-- WALLET FEEDBACK: user sees/creates own, admin manages all.
drop policy if exists "wallet_feedback_select" on public.wallet_feedback;
create policy "wallet_feedback_select" on public.wallet_feedback
  for select using (user_id = (auth.jwt() ->> 'sub') or is_admin());
drop policy if exists "wallet_feedback_insert" on public.wallet_feedback;
create policy "wallet_feedback_insert" on public.wallet_feedback
  for insert with check (user_id = (auth.jwt() ->> 'sub') or is_admin());
drop policy if exists "wallet_feedback_update" on public.wallet_feedback;
create policy "wallet_feedback_update" on public.wallet_feedback
  for update using (user_id = (auth.jwt() ->> 'sub') or is_admin());
drop policy if exists "wallet_feedback_delete" on public.wallet_feedback;
create policy "wallet_feedback_delete" on public.wallet_feedback
  for delete using (is_admin());

-- NOTIFICATIONS: recipient by email or user_id; anyone can notify admins;
-- admins see/manage everything.
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (
    lower(recipient_email) = lower((select email from users where id = (auth.jwt() ->> 'sub')))
    or user_id = (auth.jwt() ->> 'sub')
    or is_admin()
  );
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (
    lower(recipient_email) = lower((select email from users where id = (auth.jwt() ->> 'sub')))
    or user_id = (auth.jwt() ->> 'sub')
    or is_admin()
    or audience = 'admin'
  );
drop policy if exists "notifications_update_own_or_admin" on public.notifications;
create policy "notifications_update_own_or_admin" on public.notifications
  for update using (
    lower(recipient_email) = lower((select email from users where id = (auth.jwt() ->> 'sub')))
    or user_id = (auth.jwt() ->> 'sub')
    or is_admin()
  );
drop policy if exists "notifications_delete_own_or_admin" on public.notifications;
create policy "notifications_delete_own_or_admin" on public.notifications
  for delete using (
    lower(recipient_email) = lower((select email from users where id = (auth.jwt() ->> 'sub')))
    or user_id = (auth.jwt() ->> 'sub')
    or is_admin()
  );

-- =============================================================================
-- SECTION 20: RPC FUNCTIONS — DEPOSITS & WITHDRAWALS
-- =============================================================================
create or replace function public.approve_deposit_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $function$
declare v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can approve deposits'; end if;
  select * into v_tx from transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;
  update transactions set status = 'completed', notes = coalesce(p_notes, notes) where id = p_transaction_id;
  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_tx.amount where id = v_tx.user_id;
end;
$function$;

create or replace function public.reject_deposit_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $function$
declare v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can reject deposits'; end if;
  select * into v_tx from transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;
  update transactions set status = 'rejected', notes = coalesce(p_notes, notes) where id = p_transaction_id;
end;
$function$;

-- Neutralized on purpose (bug #23): users can no longer self-credit deposits.
create or replace function public.complete_own_deposit_transaction(p_transaction_id text)
returns void language plpgsql security definer as $function$
begin
  raise exception 'Deposits must be verified and approved by an admin; self-completion is disabled';
end;
$function$;

create or replace function public.create_withdrawal_transaction(p_id text, p_user_id text, p_amount numeric, p_currency text, p_asset text, p_address text default null, p_destination_tag text default null, p_bank_details jsonb default null, p_paypal_email text default null)
returns void language plpgsql security definer as $function$
declare
  v_balance numeric;
  v_caller text := auth.jwt()->>'sub';
begin
  if v_caller is null or v_caller <> p_user_id then raise exception 'You can only request a withdrawal for your own account'; end if;
  select balance into v_balance from users where id = p_user_id for update;
  if v_balance is null then raise exception 'User not found'; end if;
  if v_balance < p_amount then raise exception 'Insufficient balance'; end if;
  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount where id = p_user_id;
  insert into transactions (id, user_id, type, amount, currency, asset, status, address, destination_tag, bank_details, paypal_email)
  values (p_id, p_user_id, 'withdrawal', p_amount, p_currency, p_asset, 'pending', p_address, p_destination_tag, p_bank_details, p_paypal_email);
end;
$function$;

create or replace function public.approve_withdrawal_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $function$
declare v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can approve withdrawals'; end if;
  select * into v_tx from transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;
  update transactions set status = 'completed', notes = coalesce(p_notes, notes) where id = p_transaction_id;
end;
$function$;

create or replace function public.reject_withdrawal_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $function$
declare v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can reject withdrawals'; end if;
  select * into v_tx from transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;
  update transactions set status = 'rejected', notes = coalesce(p_notes, notes) where id = p_transaction_id;
  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_tx.amount where id = v_tx.user_id;
end;
$function$;

grant execute on function approve_deposit_transaction(text, text) to authenticated;
grant execute on function reject_deposit_transaction(text, text) to authenticated;
grant execute on function complete_own_deposit_transaction(text) to authenticated;
grant execute on function create_withdrawal_transaction(text, text, numeric, text, text, text, text, jsonb, text) to authenticated;
grant execute on function approve_withdrawal_transaction(text, text) to authenticated;
grant execute on function reject_withdrawal_transaction(text, text) to authenticated;

-- =============================================================================
-- SECTION 21: RPC FUNCTIONS — INVESTMENTS (purchase / top-up / payout claim)
-- Financial terms are recomputed server-side from the plan (bug #21 fix).
-- =============================================================================
create or replace function public.create_investment(
  p_id text, p_user_id text, p_plan_id text, p_name text, p_amount numeric,
  p_roi_percent numeric, p_expected_profit numeric, p_total_return numeric,
  p_daily_roi_percent numeric, p_start_date timestamptz, p_end_date timestamptz,
  p_remaining_days integer
) returns void language plpgsql security definer set search_path = public as $function$
declare
  v_caller text := auth.jwt()->>'sub';
  v_plan record;
  v_roi numeric;
  v_duration integer;
  v_expected_profit numeric;
  v_total_return numeric;
  v_daily_roi numeric;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  if v_caller is null or v_caller <> p_user_id then
    raise exception 'You can only invest for your own account';
  end if;

  select * into v_plan from investment_plans where id = p_plan_id;
  if not found then
    raise exception 'Investment plan not found';
  end if;
  if v_plan.enabled = false or v_plan.status <> 'active' then
    raise exception 'This investment plan is not available';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid investment amount';
  end if;
  if v_plan.min_deposit is not null and p_amount < v_plan.min_deposit then
    raise exception 'Below minimum deposit for this plan';
  end if;
  if v_plan.max_deposit is not null and p_amount > v_plan.max_deposit then
    raise exception 'Above maximum deposit for this plan';
  end if;

  v_roi := coalesce(v_plan.roi_percent, 0);
  v_duration := greatest(1, coalesce(v_plan.duration_days, 1));
  v_expected_profit := round(p_amount * v_roi / 100.0, 2);
  v_total_return := round(p_amount + v_expected_profit, 2);
  v_daily_roi := round(v_roi / v_duration, 3);
  v_end := v_start + (v_duration || ' days')::interval;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount where id = p_user_id and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  insert into active_investments (
    id, user_id, plan_id, name, amount, start_date, end_date,
    roi_percent, expected_profit, total_return, remaining_days,
    accumulated_profit, status, progress, daily_roi_percent
  )
  values (
    p_id, p_user_id, p_plan_id, v_plan.name, p_amount, v_start, v_end,
    v_roi, v_expected_profit, v_total_return, v_duration,
    0, 'Running', 0, v_daily_roi
  );

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values (p_id || '-tx', p_user_id, 'investment', p_amount, 'USD', 'completed', p_id, 'Investment: ' || v_plan.name);
end;
$function$;

create or replace function public.top_up_investment(p_investment_id text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_inv record;
  v_caller text := auth.jwt()->>'sub';
  v_new_amount numeric;
  v_expected_profit numeric;
  v_total_return numeric;
begin
  select * into v_inv from active_investments where id = p_investment_id for update;
  if not found then
    raise exception 'Investment not found';
  end if;
  if v_inv.user_id <> v_caller then
    raise exception 'You can only top up your own investment';
  end if;
  if v_inv.status in ('Completed', 'completed') or v_inv.payout_transaction_id is not null then
    raise exception 'Completed investments cannot be topped up';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount where id = v_caller and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  v_new_amount := v_inv.amount + p_amount;
  v_expected_profit := round(v_new_amount * (coalesce(v_inv.roi_percent, 0) / 100), 2);
  v_total_return := v_new_amount + v_expected_profit;

  update active_investments
  set amount = v_new_amount,
      expected_profit = v_expected_profit,
      total_return = v_total_return,
      status = 'Running'
  where id = p_investment_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id)
  values ('tx-topup-' || p_investment_id || '-' || extract(epoch from now())::text, v_caller, 'investment', p_amount, 'USD', 'completed', p_investment_id);
end;
$function$;

create or replace function public.claim_investment_payout(p_investment_id text)
  returns void
  language plpgsql
  security definer
as $function$
declare
  v_inv record;
  v_caller text := auth.jwt()->>'sub';
begin
  select * into v_inv from active_investments where id = p_investment_id for update;
  if not found then
    raise exception 'Investment not found';
  end if;
  if v_inv.user_id <> v_caller then
    raise exception 'You can only claim your own investment payout';
  end if;

  if v_inv.status = 'Completed' or v_inv.status = 'completed' or v_inv.payout_transaction_id is not null then
    return;
  end if;

  -- Maturity guard (bug #18 fix): payout only claimable once the term is over.
  if now() < v_inv.end_date then
    raise exception 'Investment has not matured yet';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_inv.total_return where id = v_caller;

  update active_investments
  set status = 'Completed',
      progress = 100,
      remaining_days = 0,
      accumulated_profit = v_inv.expected_profit,
      completed_at = now(),
      payout_transaction_id = p_investment_id || '-payout'
  where id = p_investment_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values (p_investment_id || '-payout', v_caller, 'payout', v_inv.total_return, 'USD', 'completed', p_investment_id, 'Matured payout: ' || v_inv.name);
end;
$function$;

grant execute on function create_investment(text, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, timestamptz, integer) to authenticated;
grant execute on function top_up_investment(text, numeric) to authenticated;
grant execute on function claim_investment_payout(text) to authenticated;

-- =============================================================================
-- SECTION 22: RPC FUNCTIONS — PORTFOLIO (buy/sell at TRUSTED market prices)
-- Requires market_prices to be populated (api/markets.ts does this).
-- =============================================================================
create or replace function public.buy_asset(p_user_id text, p_symbol text, p_name text, p_amount numeric, p_price numeric, p_quantity numeric, p_asset_type text)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_caller text := auth.jwt()->>'sub';
  v_existing record;
  v_price numeric;
  v_updated timestamptz;
  v_quantity numeric;
  v_new_qty numeric;
  v_new_avg numeric;
begin
  if v_caller is null or v_caller <> p_user_id then
    raise exception 'You can only trade your own account';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid trade amount';
  end if;

  -- TRUSTED price only. Client p_price / p_quantity are ignored (bug #22).
  select price, updated_at into v_price, v_updated from market_prices where symbol = p_symbol;
  if not found then
    raise exception 'No market price available for %', p_symbol;
  end if;
  if v_updated < now() - interval '15 minutes' then
    raise exception 'Market price for % is stale; trading temporarily unavailable', p_symbol;
  end if;

  v_quantity := round(p_amount / v_price, 8);
  if v_quantity <= 0 then
    raise exception 'Trade amount too small for current price';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount where id = p_user_id and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  select * into v_existing from portfolio_assets where user_id = p_user_id and symbol = p_symbol for update;
  if found then
    v_new_qty := v_existing.amount + v_quantity;
    v_new_avg := round(((v_existing.amount * v_existing.avg_buy_price) + p_amount) / v_new_qty, 2);
    update portfolio_assets set amount = v_new_qty, avg_buy_price = v_new_avg, current_price = v_price, updated_at = now() where id = v_existing.id;
  else
    insert into portfolio_assets (id, user_id, symbol, name, amount, avg_buy_price, current_price, type)
    values (gen_random_uuid()::text, p_user_id, p_symbol, p_name, v_quantity, v_price, v_price, p_asset_type);
  end if;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values ('tx-buy-' || p_user_id || '-' || extract(epoch from now())::text, p_user_id, 'investment', p_amount, 'USD', 'completed', p_symbol,
    'Purchased ' || v_quantity || ' units of ' || p_symbol || ' at $' || v_price);
end;
$function$;

create or replace function public.sell_asset(p_user_id text, p_symbol text, p_amount numeric, p_price numeric, p_quantity numeric)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_caller text := auth.jwt()->>'sub';
  v_existing record;
  v_price numeric;
  v_updated timestamptz;
  v_amount numeric;
  v_new_qty numeric;
begin
  if v_caller is null or v_caller <> p_user_id then
    raise exception 'You can only trade your own account';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Invalid sell quantity';
  end if;

  select * into v_existing from portfolio_assets where user_id = p_user_id and symbol = p_symbol for update;
  if not found or v_existing.amount < p_quantity then
    raise exception 'Insufficient holdings to sell';
  end if;

  -- TRUSTED price only. Client p_amount / p_price are ignored (bug #22).
  select price, updated_at into v_price, v_updated from market_prices where symbol = p_symbol;
  if not found then
    raise exception 'No market price available for %', p_symbol;
  end if;
  if v_updated < now() - interval '15 minutes' then
    raise exception 'Market price for % is stale; trading temporarily unavailable', p_symbol;
  end if;

  v_amount := round(p_quantity * v_price, 2);
  v_new_qty := v_existing.amount - p_quantity;

  if v_new_qty <= 0.000001 then
    delete from portfolio_assets where id = v_existing.id;
  else
    update portfolio_assets set amount = v_new_qty, current_price = v_price, updated_at = now() where id = v_existing.id;
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_amount where id = p_user_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values ('tx-sell-' || p_user_id || '-' || extract(epoch from now())::text, p_user_id, 'payout', v_amount, 'USD', 'completed', p_symbol,
    'Sold ' || p_quantity || ' units of ' || p_symbol || ' at $' || v_price);
end;
$function$;

grant execute on function buy_asset(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function sell_asset(text, text, numeric, numeric, numeric) to authenticated;

-- =============================================================================
-- SECTION 23: RPC FUNCTIONS — COPY TRADING (start / cancel / payout claim)
-- Financial terms recomputed server-side from the trader row (bug #19 fix).
-- =============================================================================
create or replace function public.create_copy_trade(p_id text, p_user_id text, p_trader_id text, p_trader_name text, p_amount_invested numeric, p_roi_percent numeric, p_expected_profit numeric, p_total_return numeric, p_start_timestamp timestamp with time zone, p_end_timestamp timestamp with time zone, p_remaining_days integer)
 returns void
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_caller text := auth.jwt()->>'sub';
  v_trader record;
  v_roi numeric;
  v_duration_days integer;
  v_expected_profit numeric;
  v_total_return numeric;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  if v_caller is null or v_caller <> p_user_id then
    raise exception 'You can only copy-trade from your own account';
  end if;

  select * into v_trader from traders where id = p_trader_id;
  if not found then
    raise exception 'Trader not found';
  end if;
  if v_trader.active = false then
    raise exception 'This trader is not accepting copy allocations';
  end if;

  if p_amount_invested is null or p_amount_invested <= 0 then
    raise exception 'Invalid copy amount';
  end if;
  if v_trader.min_copy_amount is not null and p_amount_invested < v_trader.min_copy_amount then
    raise exception 'Below minimum copy amount for this trader';
  end if;
  if v_trader.max_copy_amount is not null and p_amount_invested > v_trader.max_copy_amount then
    raise exception 'Above maximum copy amount for this trader';
  end if;

  v_roi := coalesce(v_trader.roi, 0);
  v_duration_days := greatest(1, coalesce(v_trader.profit_days, 30));
  v_expected_profit := round(p_amount_invested * v_roi / 100.0, 2);
  v_total_return := round(p_amount_invested + v_expected_profit, 2);
  v_end := v_start + (v_duration_days || ' days')::interval;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount_invested where id = p_user_id and balance >= p_amount_invested;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  insert into copy_trades (
    id, user_id, trader_id, trader_name, amount_invested, roi_percent,
    expected_profit, total_return, start_timestamp, end_timestamp,
    remaining_days, status, payout_completed, progress
  )
  values (
    p_id, p_user_id, p_trader_id, v_trader.name, p_amount_invested, v_roi,
    v_expected_profit, v_total_return, v_start, v_end,
    v_duration_days, 'Running', false, 0
  );

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values ('tx-copy-' || p_id, p_user_id, 'investment', p_amount_invested, 'USD', 'completed', p_id, 'Copy trade: ' || v_trader.name);
end;
$function$;

create or replace function public.cancel_copy_trade(p_copy_trade_id text)
 returns void
 language plpgsql
 security definer
as $function$
declare
  v_trade record;
  v_caller text := auth.jwt()->>'sub';
begin
  select * into v_trade from copy_trades where id = p_copy_trade_id for update;
  if not found then
    raise exception 'Copy trade not found';
  end if;
  if v_trade.user_id <> v_caller then
    raise exception 'You can only cancel your own copy trade';
  end if;
  if v_trade.status <> 'Running' or v_trade.payout_completed then
    raise exception 'This copy trade is not currently running';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_trade.amount_invested where id = v_caller;

  update copy_trades
  set status = 'Cancelled',
      remaining_days = 0,
      progress = 100,
      payout_completed = true,
      completed_at = now()
  where id = p_copy_trade_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values ('tx-uncopy-' || p_copy_trade_id, v_caller, 'payout', v_trade.amount_invested, 'USD', 'completed', p_copy_trade_id, 'Copy trade cancelled: refund');
end;
$function$;

create or replace function public.claim_copy_trade_payout(p_copy_trade_id text)
  returns void
  language plpgsql
  security definer
as $function$
declare
  v_ct record;
  v_caller text := auth.jwt()->>'sub';
begin
  select * into v_ct from copy_trades where id = p_copy_trade_id for update;
  if not found then
    raise exception 'Copy trade not found';
  end if;
  if v_ct.user_id <> v_caller then
    raise exception 'You can only claim your own copy trade payout';
  end if;

  -- Idempotent: already claimed → no-op (prevents double credit).
  if v_ct.status = 'Completed' or v_ct.payout_completed or v_ct.payout_transaction_id is not null then
    return;
  end if;

  if v_ct.status = 'Cancelled' then
    raise exception 'A cancelled copy trade cannot be claimed';
  end if;

  -- Maturity guard.
  if now() < v_ct.end_timestamp then
    raise exception 'Copy trade has not matured yet';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance + v_ct.total_return where id = v_caller;

  update copy_trades
  set status = 'Completed',
      payout_completed = true,
      progress = 100,
      remaining_days = 0,
      completed_at = now(),
      payout_transaction_id = p_copy_trade_id || '-payout'
  where id = p_copy_trade_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values (p_copy_trade_id || '-payout', v_caller, 'payout', v_ct.total_return, 'USD', 'completed', p_copy_trade_id, 'Copy trade payout: ' || v_ct.trader_name);
end;
$function$;

grant execute on function create_copy_trade(text, text, text, text, numeric, numeric, numeric, numeric, timestamptz, timestamptz, integer) to authenticated;
grant execute on function cancel_copy_trade(text) to authenticated;
grant execute on function claim_copy_trade_payout(text) to authenticated;

-- =============================================================================
-- SECTION 24: RPC FUNCTIONS — AIRDROP CLAIMS ("claim airdrop")
-- Submit = plain RLS insert. Approve/reject = admin-only security-definer
-- RPCs; approval atomically credits the balance and writes the payout tx.
--
-- NOTE: the live project had an older reject_airdrop_claim(text,text) whose
-- second parameter was named p_reason. CREATE OR REPLACE cannot rename input
-- parameters (SQLSTATE 42P13), so stale versions are DROPPED first below.
-- Dropping is safe: nothing depends on these functions (no views/triggers),
-- and execute privileges are re-granted right after each create.
-- =============================================================================
drop function if exists approve_airdrop_claim(text);
drop function if exists reject_airdrop_claim(text, text);

create or replace function approve_airdrop_claim(p_claim_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_reward numeric;
  v_tx_id text;
  v_name text;
  v_email text;
begin
  if not is_admin() then
    raise exception 'Only admins can approve airdrop claims';
  end if;

  select * into v_claim from airdrop_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Airdrop claim not found';
  end if;

  if v_claim.status <> 'Pending' then
    raise exception 'This airdrop claim has already been reviewed';
  end if;

  select name, email into v_name, v_email from users where id = v_claim.user_id;

  -- SECURITY: derive the reward from the airdrop CAMPAIGN (source of truth),
  -- not from the user-submitted claim.reward_amount (bug #20).
  select coalesce(nullif(reward_amount, '')::numeric, 0) into v_reward
  from airdrops where id = v_claim.airdrop_id;
  if v_reward is null then
    v_reward := coalesce(nullif(v_claim.reward_amount, '')::numeric, 0);
  end if;

  v_tx_id := 'tx-airdrop-' || p_claim_id;

  perform set_config('app.bypass_balance_protection', 'true', true);

  update users
  set balance = balance + v_reward
  where id = v_claim.user_id;

  insert into transactions (
    id, user_id, user_name, user_email, type, amount, currency, status, asset, notes, related_reference_id, occurred_at
  ) values (
    v_tx_id, v_claim.user_id, v_name, v_email, 'payout', v_reward, 'USD', 'completed', 'USD',
    'Approved airdrop claim ' || p_claim_id || coalesce(' for ' || v_claim.campaign_title, ''),
    p_claim_id, now()
  );

  update airdrop_claims
  set status = 'Approved', reviewed_at = now(), payout_transaction_id = v_tx_id
  where id = p_claim_id;
end;
$$;

grant execute on function approve_airdrop_claim(text) to authenticated;

create or replace function reject_airdrop_claim(p_claim_id text, p_admin_notes text default 'Rejected by admin.')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can reject airdrop claims';
  end if;

  update airdrop_claims
  set status = 'Rejected', reviewed_at = now(), admin_notes = p_admin_notes
  where id = p_claim_id and status = 'Pending';

  if not found then
    raise exception 'Airdrop claim not found or already reviewed';
  end if;
end;
$$;

grant execute on function reject_airdrop_claim(text, text) to authenticated;

-- =============================================================================
-- SECTION 25: RPC FUNCTIONS — SUPPORT TICKETS
-- Drop-before-create guards: protects against any legacy deployment where a
-- same-signature function used different parameter names (42P13).
-- =============================================================================
drop function if exists reply_to_ticket(text, text, text);
drop function if exists reply_to_ticket_as_support(text, text, text);
drop function if exists close_ticket(text);
drop function if exists set_ticket_priority(text, text);

create or replace function reply_to_ticket(p_ticket_id text, p_text text, p_time text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_tickets
  set
    messages = messages || jsonb_build_array(jsonb_build_object('sender', 'user', 'text', p_text, 'time', p_time)),
    status = 'pending',
    updated_at = now()
  where id = p_ticket_id
    and user_id = (auth.jwt() ->> 'sub');

  if not found then
    raise exception 'Ticket not found or not owned by caller';
  end if;
end;
$$;

create or replace function reply_to_ticket_as_support(p_ticket_id text, p_text text, p_time text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_tickets
  set
    messages = messages || jsonb_build_array(jsonb_build_object('sender', 'support', 'text', p_text, 'time', p_time)),
    status = 'resolved',
    updated_at = now()
  where id = p_ticket_id
    and (is_admin() or user_id = (auth.jwt() ->> 'sub'));

  if not found then
    raise exception 'Ticket not found or not permitted';
  end if;
end;
$$;

create or replace function close_ticket(p_ticket_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can close tickets';
  end if;

  update support_tickets
  set status = 'resolved', updated_at = now()
  where id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found';
  end if;
end;
$$;

create or replace function set_ticket_priority(p_ticket_id text, p_priority text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can set ticket priority';
  end if;

  if p_priority not in ('low', 'medium', 'high') then
    raise exception 'Invalid priority: %', p_priority;
  end if;

  update support_tickets
  set priority = p_priority, updated_at = now()
  where id = p_ticket_id;

  if not found then
    raise exception 'Ticket not found';
  end if;
end;
$$;

grant execute on function reply_to_ticket(text, text, text) to authenticated;
grant execute on function reply_to_ticket_as_support(text, text, text) to authenticated;
grant execute on function close_ticket(text) to authenticated;
grant execute on function set_ticket_priority(text, text) to authenticated;

-- =============================================================================
-- SECTION 26: RPC FUNCTION — ADMIN MANUAL BALANCE OVERRIDE
-- =============================================================================
drop function if exists admin_update_user_balance(text, numeric, text, text);

create or replace function admin_update_user_balance(
  p_user_id text,
  p_new_balance numeric,
  p_label text default 'Admin Balance Edit',
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance numeric;
  v_name text;
  v_email text;
  v_delta numeric;
  v_tx_id text;
begin
  if not is_admin() then
    raise exception 'Only admins can override a user balance directly';
  end if;

  select balance, name, email into v_current_balance, v_name, v_email
  from users
  where id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  v_delta := p_new_balance - v_current_balance;
  v_tx_id := 'tx-adj-' || p_user_id || '-' || extract(epoch from clock_timestamp())::bigint;

  perform set_config('app.bypass_balance_protection', 'true', true);

  update users
  set balance = p_new_balance
  where id = p_user_id;

  insert into transactions (
    id, user_id, user_name, user_email, type, amount, currency, status, asset, notes, occurred_at
  ) values (
    v_tx_id, p_user_id, v_name, v_email, 'adjustment', abs(v_delta), 'USD', 'completed', 'USD',
    coalesce(nullif(p_notes, ''), p_label), now()
  );
end;
$$;

grant execute on function admin_update_user_balance(text, numeric, text, text) to authenticated;

-- =============================================================================
-- SECTION 27: STORAGE BUCKETS (deposit proofs + wallet QR codes)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('deposit-proofs', 'deposit-proofs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('deposit-wallet-qr', 'deposit-wallet-qr', true)
on conflict (id) do nothing;

drop policy if exists "deposit_proofs_user_upload" on storage.objects;
create policy "deposit_proofs_user_upload" on storage.objects
  for insert with check (bucket_id = 'deposit-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin()));

drop policy if exists "deposit_proofs_owner_admin_select" on storage.objects;
create policy "deposit_proofs_owner_admin_select" on storage.objects
  for select using (bucket_id = 'deposit-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin()));

drop policy if exists "deposit_wallet_qr_public_select" on storage.objects;
create policy "deposit_wallet_qr_public_select" on storage.objects
  for select using (bucket_id = 'deposit-wallet-qr');

drop policy if exists "deposit_wallet_qr_admin_write" on storage.objects;
create policy "deposit_wallet_qr_admin_write" on storage.objects
  for all using (bucket_id = 'deposit-wallet-qr' and is_admin());

-- =============================================================================
-- SECTION 28: BACKFILL EXISTING AUTH USERS INTO PUBLIC.USERS
-- =============================================================================
insert into public.users (id, email, name, role, account_type, country, currency, balance, status)
select
  au.id::text,
  coalesce(au.email, ''),
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  'user', -- Roles are assigned explicitly in public.users, never from signup metadata.
  coalesce(au.raw_user_meta_data->>'account_type', 'Bronze'),
  coalesce(au.raw_user_meta_data->>'country', 'United States'),
  coalesce(au.raw_user_meta_data->>'currency', 'USD'),
  0,
  'active'
from auth.users au
on conflict (id) do update set
  name = coalesce(excluded.name, users.name);

-- =============================================================================
-- DONE. Post-run sanity check (optional — run in the SQL editor):
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--    order by table_name;
-- You should see: active_investments, airdrop_claims, airdrops,
-- announcements, app_settings, copy_trades, deposit_wallets, investment_plans,
-- kyc_submissions, market_prices, notifications, portfolio_assets,
-- site_content, support_tickets, traders, transactions,
-- user_read_announcements, users, wallet_feedback.
-- =============================================================================
