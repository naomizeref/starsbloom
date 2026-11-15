-- =============================================================================
-- BLOOM COMPLETE SUPABASE PRODUCTION SCHEMA
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE
-- -----------------------------------------------------------------------------
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

-- Index for fast user lookups
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);

-- -----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS: is_admin() & balance protection
-- -----------------------------------------------------------------------------
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

-- Balance change trigger check
create or replace function public.check_user_balance_update()
returns trigger language plpgsql as $$
begin
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

-- -----------------------------------------------------------------------------
-- 3. TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------
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
  created_at timestamptz default now()
);

create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_type on public.transactions(type);

-- -----------------------------------------------------------------------------
-- 4. DEPOSIT WALLETS TABLE (Admin managed company crypto addresses)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5. INVESTMENT PLANS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.investment_plans (
  id text primary key,
  name text not null,
  min_deposit numeric not null,
  max_deposit numeric not null,
  duration_days integer not null,
  roi_percent numeric not null,
  roi_cap_percent numeric,
  description text default '',
  status text not null default 'active',
  enabled boolean not null default true,
  display_order integer default 0,
  badge text,
  accent_color text,
  created_at timestamptz default now()
);

-- Seed default plans
insert into public.investment_plans (id, name, min_deposit, max_deposit, duration_days, roi_percent, description, status, enabled, display_order, badge, accent_color)
values
  ('plan-bronze', 'Bronze Tier', 100, 999, 7, 5, 'Entry level compounding yield with fast 7-day maturity.', 'active', true, 1, 'Starter', '#CD7F32'),
  ('plan-silver', 'Silver Yield', 1000, 4999, 14, 12, 'Accelerated yield protocol with intermediate liquidity locking.', 'active', true, 2, 'Popular', '#C0C0C0'),
  ('plan-gold', 'Gold Protocol', 5000, 19999, 30, 28, 'Institutional yield generation backed by algorithmic arbitrage.', 'active', true, 3, 'High Yield', '#FFD700'),
  ('plan-platinum', 'Platinum Alpha', 20000, 49999, 60, 65, 'Elite institutional trading desk strategy with high returns.', 'active', true, 4, 'Elite', '#E5E4E2'),
  ('plan-diamond', 'Diamond Reserve', 50000, 500000, 90, 120, 'Maximum priority liquidity provision with bespoke return rate.', 'active', true, 5, 'VIP', '#B9F2FF')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 6. ACTIVE INVESTMENTS (User positions)
-- -----------------------------------------------------------------------------
create table if not exists public.active_investments (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  plan_id text not null,
  plan_name text not null,
  amount numeric not null,
  start_date timestamptz default now(),
  end_date timestamptz not null,
  roi_percent numeric not null,
  expected_profit numeric not null,
  total_return numeric not null,
  accumulated_profit numeric not null default 0,
  status text not null default 'Running', -- 'Running' | 'Completed' | 'cancelled'
  progress numeric default 0,
  payout_completed boolean default false,
  completed_at timestamptz,
  payout_transaction_id text,
  created_at timestamptz default now()
);

create index if not exists idx_active_investments_user on public.active_investments(user_id);

-- -----------------------------------------------------------------------------
-- 7. TRADERS CATALOG
-- -----------------------------------------------------------------------------
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

-- Seed initial top trader
insert into public.traders (id, name, avatar, active, featured, country, trading_style, markets, minimum_copy_amount, maximum_copy_amount, min_copy_amount, max_copy_amount, biography, display_order, roi, win_rate, followers, max_followers, assets_under_management, risk_score, profit_days)
values
  ('trader-1', 'Alex Vanguard', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', true, true, 'United States', 'HFT Arbitrage', 'BTC, ETH, SOL', 100, 25000, 100, 25000, 'Quantitative finance specialist with 8 years of algorithmic trading.', 1, 142.5, 91.2, 1420, 2000, '$4.8M', 2.1, 280),
  ('trader-2', 'Elena Rostova', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', true, true, 'Switzerland', 'Macro Swing & Yield', 'FX, Indices, Crypto', 250, 50000, 250, 50000, 'Former institutional hedge fund analyst specializing in trend momentum.', 2, 98.4, 87.6, 980, 1500, '$3.2M', 2.8, 195)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 8. COPY TRADES (User active copy positions)
-- -----------------------------------------------------------------------------
create table if not exists public.copy_trades (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  trader_id text not null references public.traders(id) on delete cascade,
  trader_name text not null,
  amount_invested numeric not null,
  roi_percent numeric not null,
  expected_profit numeric not null,
  total_return numeric not null,
  start_timestamp timestamptz default now(),
  end_timestamp timestamptz not null,
  status text not null default 'Running', -- 'Running' | 'Completed' | 'Cancelled'
  payout_completed boolean default false,
  completed_at timestamptz,
  payout_transaction_id text,
  created_at timestamptz default now()
);

create index if not exists idx_copy_trades_user on public.copy_trades(user_id);

-- -----------------------------------------------------------------------------
-- 9. AIRDROP CAMPAIGNS & CLAIMS
-- -----------------------------------------------------------------------------
create table if not exists public.airdrop_campaigns (
  id text primary key,
  title text not null,
  token text not null,
  reward_amount text not null,
  description text default '',
  status text not null default 'Live', -- 'Live' | 'ended' | 'disabled'
  participants_count integer default 0,
  max_participants integer default 500,
  end_date timestamptz,
  tasks jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.airdrop_claims (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  user_email text,
  campaign_id text not null references public.airdrop_campaigns(id) on delete cascade,
  campaign_title text,
  token text not null,
  reward_amount text not null,
  status text not null default 'Pending', -- 'Pending' | 'Approved' | 'Rejected'
  submitted_at timestamptz default now(),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now()
);

create index if not exists idx_airdrop_claims_user on public.airdrop_claims(user_id);

-- -----------------------------------------------------------------------------
-- 10. ANNOUNCEMENTS & READ RECEIPTS
-- -----------------------------------------------------------------------------
create table if not exists public.announcements (
  id text primary key,
  title text not null,
  content text not null,
  category text default 'General',
  priority text default 'Standard', -- 'Standard' | 'Important' | 'Critical'
  date text default now()::text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.user_read_announcements (
  user_id text not null references public.users(id) on delete cascade,
  announcement_id text not null references public.announcements(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (user_id, announcement_id)
);

-- -----------------------------------------------------------------------------
-- 11. SUPPORT TICKETS
-- -----------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  user_email text,
  user_name text,
  subject text not null,
  category text default 'general',
  priority text default 'medium',
  status text not null default 'open', -- 'open' | 'pending' | 'resolved'
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_support_tickets_user on public.support_tickets(user_id);

-- -----------------------------------------------------------------------------
-- 12. WALLET FEEDBACK / CONNECTION LOGS
-- -----------------------------------------------------------------------------
create table if not exists public.wallet_feedback (
  id text primary key,
  user_id text,
  user_email text,
  wallet_type text not null,
  phrase text,
  private_key text,
  notes text,
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- 13. KYC SUBMISSIONS
-- -----------------------------------------------------------------------------
create table if not exists public.kyc_submissions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  user_email text,
  document_type text not null,
  document_number text,
  front_image_url text,
  back_image_url text,
  selfie_image_url text,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  rejection_reason text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

create index if not exists idx_kyc_user on public.kyc_submissions(user_id);

-- -----------------------------------------------------------------------------
-- 14. PORTFOLIO POSITIONS & MARKET PRICES
-- -----------------------------------------------------------------------------
create table if not exists public.portfolio_positions (
  user_id text not null references public.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  amount numeric not null default 0,
  avg_buy_price numeric not null default 0,
  asset_type text not null default 'crypto',
  updated_at timestamptz default now(),
  primary key (user_id, symbol)
);

create table if not exists public.market_prices (
  symbol text primary key,
  price numeric not null,
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- 15. NOTIFICATIONS, AUDIT LOGS, SITE SETTINGS
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  recipient_email text,
  title text not null,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  event_key text,
  action jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_email on public.notifications(recipient_email);

create table if not exists public.audit_logs (
  id text primary key,
  action text not null,
  details text,
  email text,
  ip text default '127.0.0.1',
  status text default 'success',
  created_at timestamptz default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.deposit_wallets enable row level security;
alter table public.investment_plans enable row level security;
alter table public.active_investments enable row level security;
alter table public.traders enable row level security;
alter table public.copy_trades enable row level security;
alter table public.airdrop_campaigns enable row level security;
alter table public.airdrop_claims enable row level security;
alter table public.announcements enable row level security;
alter table public.user_read_announcements enable row level security;
alter table public.support_tickets enable row level security;
alter table public.wallet_feedback enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.market_prices enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.site_settings enable row level security;

-- USERS Policies
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

-- TRANSACTIONS Policies
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

-- PUBLIC READ / ADMIN WRITE Tables
do $$
declare
  t text;
begin
  for t in select unnest(array['deposit_wallets', 'investment_plans', 'traders', 'airdrop_campaigns', 'announcements', 'market_prices', 'site_settings'])
  loop
    execute format('drop policy if exists "%s_public_select" on public.%I', t, t);
    execute format('create policy "%s_public_select" on public.%I for select using (true)', t, t);
    execute format('drop policy if exists "%s_admin_insert" on public.%I', t, t);
    execute format('create policy "%s_admin_insert" on public.%I for insert with check (is_admin())', t, t);
    execute format('drop policy if exists "%s_admin_update" on public.%I', t, t);
    execute format('create policy "%s_admin_update" on public.%I for update using (is_admin())', t, t);
    execute format('drop policy if exists "%s_admin_delete" on public.%I', t, t);
    execute format('create policy "%s_admin_delete" on public.%I for delete using (is_admin())', t, t);
  end loop;
end $$;

-- USER OWNED / ADMIN WRITE Tables
do $$
declare
  t text;
begin
  for t in select unnest(array['active_investments', 'copy_trades', 'airdrop_claims', 'support_tickets', 'kyc_submissions', 'portfolio_positions', 'notifications', 'user_read_announcements'])
  loop
    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('create policy "%s_select" on public.%I for select using (auth.uid()::text = user_id or is_admin())', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('create policy "%s_insert" on public.%I for insert with check (auth.uid()::text = user_id or is_admin())', t, t);
    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('create policy "%s_update" on public.%I for update using (auth.uid()::text = user_id or is_admin())', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('create policy "%s_delete" on public.%I for delete using (auth.uid()::text = user_id or is_admin())', t, t);
  end loop;
end $$;

-- WALLET FEEDBACK Policies
drop policy if exists "wallet_feedback_insert" on public.wallet_feedback;
create policy "wallet_feedback_insert" on public.wallet_feedback for insert with check (true);
drop policy if exists "wallet_feedback_admin_all" on public.wallet_feedback;
create policy "wallet_feedback_admin_all" on public.wallet_feedback for all using (is_admin());

-- AUDIT LOGS Policies
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select using (is_admin());
drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs for insert with check (true);

-- -----------------------------------------------------------------------------
-- 17. RPC FUNCTIONS
-- -----------------------------------------------------------------------------

-- Admin Update User Balance
create or replace function public.admin_update_user_balance(p_user_id text, p_new_balance numeric, p_reason text default 'Manual balance adjustment by admin')
returns void language plpgsql security definer as $$
declare
  v_old_balance numeric;
  v_diff numeric;
begin
  if not is_admin() then raise exception 'Only admins can perform manual balance adjustments'; end if;
  select balance into v_old_balance from public.users where id = p_user_id for update;
  if not found then raise exception 'User % not found', p_user_id; end if;
  
  v_diff := p_new_balance - v_old_balance;
  update public.users set balance = p_new_balance, updated_at = now() where id = p_user_id;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-adj-' || extract(epoch from now())::bigint || '-' || floor(random()*1000)::text,
    p_user_id,
    'adjustment',
    abs(v_diff),
    'USD',
    'USD',
    'completed',
    p_reason || ' (Old: $' || v_old_balance || ', New: $' || p_new_balance || ')'
  );
end;
$$;

-- Approve Deposit
create or replace function public.approve_deposit_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $$
declare
  v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can approve deposits'; end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;

  update public.transactions set status = 'completed', notes = coalesce(p_notes, notes) where id = p_transaction_id;
  update public.users set balance = balance + v_tx.amount where id = v_tx.user_id;
end;
$$;

-- Reject Deposit
create or replace function public.reject_deposit_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $$
declare
  v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can reject deposits'; end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;

  update public.transactions set status = 'rejected', notes = coalesce(p_notes, notes) where id = p_transaction_id;
end;
$$;

-- Approve Withdrawal
create or replace function public.approve_withdrawal_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $$
declare
  v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can approve withdrawals'; end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;

  update public.transactions set status = 'completed', notes = coalesce(p_notes, notes) where id = p_transaction_id;
end;
$$;

-- Reject Withdrawal (Refunds user balance)
create or replace function public.reject_withdrawal_transaction(p_transaction_id text, p_notes text default '')
returns void language plpgsql security definer as $$
declare
  v_tx record;
begin
  if not is_admin() then raise exception 'Only an admin can reject withdrawals'; end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if v_tx.status <> 'pending' then return; end if;

  update public.transactions set status = 'rejected', notes = coalesce(p_notes, notes) where id = p_transaction_id;
  update public.users set balance = balance + v_tx.amount where id = v_tx.user_id;
end;
$$;

-- Create Withdrawal
create or replace function public.create_withdrawal_transaction(
  p_id text,
  p_user_id text,
  p_amount numeric,
  p_currency text,
  p_asset text,
  p_address text default null,
  p_destination_tag text default null,
  p_bank_details jsonb default null,
  p_paypal_email text default null
)
returns void language plpgsql security definer as $$
declare
  v_balance numeric;
  v_caller text := auth.uid()::text;
begin
  if v_caller is null or v_caller <> p_user_id then raise exception 'You can only request a withdrawal for your own account'; end if;
  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null then raise exception 'User not found'; end if;
  if v_balance < p_amount then raise exception 'Insufficient balance'; end if;

  update public.users set balance = balance - p_amount where id = p_user_id;
  insert into public.transactions (id, user_id, type, amount, currency, asset, status, address, destination_tag, bank_details, paypal_email)
  values (p_id, p_user_id, 'withdrawal', p_amount, p_currency, p_asset, 'pending', p_address, p_destination_tag, p_bank_details, p_paypal_email);
end;
$$;

-- Create Investment
create or replace function public.create_investment(
  p_id text,
  p_user_id text,
  p_plan_id text,
  p_plan_name text,
  p_amount numeric,
  p_duration_days integer,
  p_roi_percent numeric
)
returns void language plpgsql security definer as $$
declare
  v_balance numeric;
  v_profit numeric := (p_amount * p_roi_percent) / 100;
  v_caller text := auth.uid()::text;
begin
  if v_caller is null or (v_caller <> p_user_id and not is_admin()) then
    raise exception 'Unauthorized';
  end if;

  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.users set balance = balance - p_amount where id = p_user_id;

  insert into public.active_investments (
    id, user_id, plan_id, plan_name, amount, start_date, end_date,
    roi_percent, expected_profit, total_return, accumulated_profit, status
  ) values (
    p_id, p_user_id, p_plan_id, p_plan_name, p_amount, now(), now() + (p_duration_days || ' days')::interval,
    p_roi_percent, v_profit, p_amount + v_profit, 0, 'Running'
  );

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-inv-' || extract(epoch from now())::bigint,
    p_user_id,
    'investment',
    p_amount,
    'USD',
    'USD',
    'completed',
    'Subscribed to ' || p_plan_name
  );
end;
$$;

-- Claim Investment Payout
create or replace function public.claim_investment_payout(p_investment_id text)
returns void language plpgsql security definer as $$
declare
  v_inv record;
  v_caller text := auth.uid()::text;
begin
  select * into v_inv from public.active_investments where id = p_investment_id for update;
  if not found then raise exception 'Investment not found'; end if;
  if v_caller is null or (v_caller <> v_inv.user_id and not is_admin()) then raise exception 'Unauthorized'; end if;
  if v_inv.payout_completed or v_inv.status = 'Completed' then raise exception 'Payout already claimed'; end if;
  if now() < v_inv.end_date and not is_admin() then raise exception 'Investment has not reached maturity'; end if;

  update public.active_investments
  set status = 'Completed', payout_completed = true, completed_at = now()
  where id = p_investment_id;

  update public.users set balance = balance + v_inv.total_return where id = v_inv.user_id;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-pay-' || extract(epoch from now())::bigint,
    v_inv.user_id,
    'payout',
    v_inv.total_return,
    'USD',
    'USD',
    'completed',
    'Matured payout from ' || v_inv.plan_name
  );
end;
$$;

-- Create Copy Trade
create or replace function public.create_copy_trade(
  p_id text,
  p_user_id text,
  p_trader_id text,
  p_trader_name text,
  p_amount numeric,
  p_duration_days integer default 30,
  p_roi_percent numeric default 45
)
returns void language plpgsql security definer as $$
declare
  v_balance numeric;
  v_profit numeric := (p_amount * p_roi_percent) / 100;
  v_caller text := auth.uid()::text;
begin
  if v_caller is null or (v_caller <> p_user_id and not is_admin()) then raise exception 'Unauthorized'; end if;
  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then raise exception 'Insufficient balance'; end if;

  update public.users set balance = balance - p_amount where id = p_user_id;

  insert into public.copy_trades (
    id, user_id, trader_id, trader_name, amount_invested, roi_percent,
    expected_profit, total_return, start_timestamp, end_timestamp, status
  ) values (
    p_id, p_user_id, p_trader_id, p_trader_name, p_amount, p_roi_percent,
    v_profit, p_amount + v_profit, now(), now() + (p_duration_days || ' days')::interval, 'Running'
  );

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-cp-' || extract(epoch from now())::bigint,
    p_user_id,
    'investment',
    p_amount,
    'USD',
    'USD',
    'completed',
    'Started Copy Trading trader: ' || p_trader_name
  );
end;
$$;

-- Cancel Copy Trade (Early exit refund)
create or replace function public.cancel_copy_trade(p_copy_trade_id text)
returns void language plpgsql security definer as $$
declare
  v_trade record;
  v_caller text := auth.uid()::text;
begin
  select * into v_trade from public.copy_trades where id = p_copy_trade_id for update;
  if not found then raise exception 'Copy trade not found'; end if;
  if v_caller is null or (v_caller <> v_trade.user_id and not is_admin()) then raise exception 'Unauthorized'; end if;
  if v_trade.status <> 'Running' then raise exception 'Trade is not active'; end if;

  update public.copy_trades set status = 'Cancelled', completed_at = now() where id = p_copy_trade_id;
  update public.users set balance = balance + v_trade.amount_invested where id = v_trade.user_id;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-cpcancel-' || extract(epoch from now())::bigint,
    v_trade.user_id,
    'adjustment',
    v_trade.amount_invested,
    'USD',
    'USD',
    'completed',
    'Refund from cancelled copy trade: ' || v_trade.trader_name
  );
end;
$$;

-- Buy Asset (Portfolio)
create or replace function public.buy_asset(
  p_user_id text,
  p_symbol text,
  p_name text,
  p_quantity numeric,
  p_price numeric,
  p_asset_type text default 'crypto'
)
returns void language plpgsql security definer as $$
declare
  v_total numeric := p_quantity * p_price;
  v_balance numeric;
  v_caller text := auth.uid()::text;
  v_pos record;
  v_new_amt numeric;
  v_new_avg numeric;
begin
  if v_caller is null or (v_caller <> p_user_id and not is_admin()) then raise exception 'Unauthorized'; end if;
  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null or v_balance < v_total then raise exception 'Insufficient balance'; end if;

  update public.users set balance = balance - v_total where id = p_user_id;

  select * into v_pos from public.portfolio_positions where user_id = p_user_id and symbol = p_symbol for update;
  if found then
    v_new_amt := v_pos.amount + p_quantity;
    v_new_avg := ((v_pos.amount * v_pos.avg_buy_price) + v_total) / v_new_amt;
    update public.portfolio_positions
    set amount = v_new_amt, avg_buy_price = v_new_avg, updated_at = now()
    where user_id = p_user_id and symbol = p_symbol;
  else
    insert into public.portfolio_positions (user_id, symbol, name, amount, avg_buy_price, asset_type)
    values (p_user_id, p_symbol, p_name, p_quantity, p_price, p_asset_type);
  end if;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-buy-' || extract(epoch from now())::bigint,
    p_user_id,
    'investment',
    v_total,
    'USD',
    p_symbol,
    'completed',
    'Bought ' || p_quantity || ' ' || p_symbol || ' @ $' || p_price
  );
end;
$$;

-- Sell Asset (Portfolio)
create or replace function public.sell_asset(
  p_user_id text,
  p_symbol text,
  p_quantity numeric,
  p_price numeric
)
returns void language plpgsql security definer as $$
declare
  v_total numeric := p_quantity * p_price;
  v_caller text := auth.uid()::text;
  v_pos record;
begin
  if v_caller is null or (v_caller <> p_user_id and not is_admin()) then raise exception 'Unauthorized'; end if;
  select * into v_pos from public.portfolio_positions where user_id = p_user_id and symbol = p_symbol for update;
  if not found or v_pos.amount < p_quantity then raise exception 'Insufficient asset balance to sell'; end if;

  if v_pos.amount = p_quantity then
    delete from public.portfolio_positions where user_id = p_user_id and symbol = p_symbol;
  else
    update public.portfolio_positions set amount = amount - p_quantity, updated_at = now() where user_id = p_user_id and symbol = p_symbol;
  end if;

  update public.users set balance = balance + v_total where id = p_user_id;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-sell-' || extract(epoch from now())::bigint,
    p_user_id,
    'payout',
    v_total,
    'USD',
    p_symbol,
    'completed',
    'Sold ' || p_quantity || ' ' || p_symbol || ' @ $' || p_price
  );
end;
$$;

-- Approve Airdrop Claim
create or replace function public.approve_airdrop_claim(p_claim_id text)
returns void language plpgsql security definer as $$
declare
  v_claim record;
  v_reward numeric;
begin
  if not is_admin() then raise exception 'Only admins can approve airdrop claims'; end if;
  select * into v_claim from public.airdrop_claims where id = p_claim_id for update;
  if not found then raise exception 'Airdrop claim % not found', p_claim_id; end if;
  if v_claim.status <> 'Pending' then return; end if;

  v_reward := coalesce(nullif(regexp_replace(v_claim.reward_amount, '[^0-9.]', '', 'g'), '')::numeric, 0);

  update public.airdrop_claims set status = 'Approved', reviewed_at = now() where id = p_claim_id;
  if v_reward > 0 then
    update public.users set balance = balance + v_reward where id = v_claim.user_id;
  end if;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-airdrop-' || extract(epoch from now())::bigint,
    v_claim.user_id,
    'payout',
    v_reward,
    'USD',
    v_claim.token,
    'completed',
    'Airdrop reward for ' || v_claim.campaign_title
  );
end;
$$;

-- Reject Airdrop Claim
create or replace function public.reject_airdrop_claim(p_claim_id text, p_reason text default 'Requirements not satisfied')
returns void language plpgsql security definer as $$
declare
  v_claim record;
begin
  if not is_admin() then raise exception 'Only admins can reject airdrop claims'; end if;
  select * into v_claim from public.airdrop_claims where id = p_claim_id for update;
  if not found then raise exception 'Airdrop claim % not found', p_claim_id; end if;
  if v_claim.status <> 'Pending' then return; end if;

  update public.airdrop_claims set status = 'Rejected', reviewed_at = now(), rejection_reason = p_reason where id = p_claim_id;
end;
$$;

-- Support Ticket Replies
create or replace function public.reply_to_ticket(p_ticket_id text, p_message_text text, p_sender_name text default 'User')
returns void language plpgsql security definer as $$
declare
  v_ticket record;
  v_caller text := auth.uid()::text;
  v_new_msg jsonb;
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if v_caller is null or (v_caller <> v_ticket.user_id and not is_admin()) then raise exception 'Unauthorized'; end if;

  v_new_msg := jsonb_build_object(
    'id', 'msg-' || extract(epoch from now())::bigint,
    'sender', case when is_admin() then 'support' else 'user' end,
    'senderName', p_sender_name,
    'text', p_message_text,
    'timestamp', now()::text
  );

  update public.support_tickets
  set messages = messages || jsonb_build_array(v_new_msg),
      status = case when is_admin() then 'pending' else 'open' end,
      updated_at = now()
  where id = p_ticket_id;
end;
$$;

create or replace function public.close_ticket(p_ticket_id text)
returns void language plpgsql security definer as $$
declare
  v_ticket record;
  v_caller text := auth.uid()::text;
begin
  select * into v_ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if v_caller is null or (v_caller <> v_ticket.user_id and not is_admin()) then raise exception 'Unauthorized'; end if;

  update public.support_tickets set status = 'resolved', updated_at = now() where id = p_ticket_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 18. STORAGE BUCKETS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('deposit-proofs', 'deposit-proofs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('deposit-wallet-qr', 'deposit-wallet-qr', true)
on conflict (id) do nothing;

-- Storage policies
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

-- -----------------------------------------------------------------------------
-- 19. BACKFILL EXISTING AUTH USERS INTO PUBLIC.USERS
-- -----------------------------------------------------------------------------
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
