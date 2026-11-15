-- =============================================================
-- DIAGNOSTIC + FIX: Investment & Copy Trading Issues
-- Run this entire file in the Supabase SQL Editor.
-- Safe to re-run (all statements are idempotent).
-- =============================================================

-- -------------------------------------------------------
-- SECTION 1: Verify / seed investment_plans table
-- -------------------------------------------------------

-- Ensure the table exists (it may not if plan migration wasn't run)
create table if not exists investment_plans (
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

alter table investment_plans enable row level security;

drop policy if exists "investment_plans_select" on investment_plans;
create policy "investment_plans_select" on investment_plans
  for select using (true);

-- Seed default plans (idempotent)
insert into investment_plans (id, name, min_deposit, max_deposit, duration_days, roi_percent, roi_cap_percent, description, status, enabled, display_order, badge, accent_color)
values
  ('plan-bronze',   'Bronze Tier',   100,   999,      7,  12, 12, 'An entry-level plan with a short lockup period.',       'active', true, 10, null,       '#CD7F32'),
  ('plan-silver',   'Silver Tier',   1000,  4999,    10,  18, 18, 'An upgraded plan designed for growing portfolios.',     'active', true, 20, null,       '#94a3b8'),
  ('plan-gold',     'Gold Tier',     5000,  9999,    14,  24, 24, 'A premium plan tailored for serious investors.',        'active', true, 30, 'Popular',  '#2563EB'),
  ('plan-platinum', 'Platinum Tier', 10000, 49999,   21,  36, 36, 'An elite wealth plan featuring top-tier yield.',       'active', true, 40, null,       '#818cf8'),
  ('plan-diamond',  'Diamond Tier',  50000, 10000000,30,  48, 48, 'Our highest-level institutional allocation.',           'active', true, 50, 'Elite VIP','#22d3ee')
on conflict (id) do update set
  status  = excluded.status,
  enabled = excluded.enabled;

-- -------------------------------------------------------
-- SECTION 2: Re-deploy create_investment RPC
-- (Security-hardened: recomputes financials server-side)
-- -------------------------------------------------------

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
    raise exception 'Investment plan not found: %', p_plan_id;
  end if;
  if v_plan.enabled = false or v_plan.status <> 'active' then
    raise exception 'This investment plan is not available';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid investment amount';
  end if;
  if v_plan.min_deposit is not null and p_amount < v_plan.min_deposit then
    raise exception 'Below minimum deposit for this plan ($%)', v_plan.min_deposit;
  end if;
  if v_plan.max_deposit is not null and p_amount > v_plan.max_deposit then
    raise exception 'Above maximum deposit for this plan ($%)', v_plan.max_deposit;
  end if;

  v_roi            := coalesce(v_plan.roi_percent, 0);
  v_duration       := greatest(1, coalesce(v_plan.duration_days, 1));
  v_expected_profit := round(p_amount * v_roi / 100.0, 2);
  v_total_return   := round(p_amount + v_expected_profit, 2);
  v_daily_roi      := round(v_roi / v_duration, 3);
  v_end            := v_start + (v_duration || ' days')::interval;

  -- Debit balance
  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount
  where id = p_user_id and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  -- Insert using ONLY columns that exist in active_investments
  insert into active_investments (
    id, user_id, plan_id, plan_name,
    amount, start_date, end_date,
    roi_percent, expected_profit, total_return,
    accumulated_profit, status
  ) values (
    p_id, p_user_id, p_plan_id, v_plan.name,
    p_amount, v_start, v_end,
    v_roi, v_expected_profit, v_total_return,
    0, 'Running'
  );

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values (p_id || '-tx', p_user_id, 'investment', p_amount, 'USD', 'completed', p_id, 'Investment: ' || v_plan.name);
end;
$function$;

-- -------------------------------------------------------
-- SECTION 3: Fix copy_trades status constraint + RPC
-- -------------------------------------------------------

-- Normalise any rows stored with old casing
update copy_trades set status = 'Running'   where status in ('running', 'active', 'Active');
update copy_trades set status = 'Completed' where status in ('completed');
update copy_trades set status = 'Cancelled' where status in ('cancelled', 'canceled', 'Canceled');

alter table copy_trades drop constraint if exists copy_trades_status_check;
alter table copy_trades add constraint copy_trades_status_check
  check (status in ('Running', 'Completed', 'Cancelled'));

-- Add columns if missing (idempotent)
alter table copy_trades add column if not exists completed_at timestamptz;
alter table copy_trades add column if not exists payout_transaction_id text;

-- Re-deploy create_copy_trade RPC
create or replace function public.create_copy_trade(
  p_id text, p_user_id text, p_trader_id text, p_trader_name text,
  p_amount_invested numeric, p_roi_percent numeric, p_expected_profit numeric,
  p_total_return numeric, p_start_timestamp timestamptz, p_end_timestamp timestamptz,
  p_remaining_days integer
) returns void language plpgsql security definer set search_path = public as $function$
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
    raise exception 'Trader not found: %', p_trader_id;
  end if;
  if v_trader.active = false then
    raise exception 'This trader is not accepting copy allocations';
  end if;

  if p_amount_invested is null or p_amount_invested <= 0 then
    raise exception 'Invalid copy amount';
  end if;
  if v_trader.min_copy_amount is not null and p_amount_invested < v_trader.min_copy_amount then
    raise exception 'Below minimum copy amount for this trader ($%)', v_trader.min_copy_amount;
  end if;
  if v_trader.max_copy_amount is not null and p_amount_invested > v_trader.max_copy_amount then
    raise exception 'Above maximum copy amount for this trader ($%)', v_trader.max_copy_amount;
  end if;

  v_roi           := coalesce(v_trader.roi, 0);
  v_duration_days := greatest(1, coalesce(v_trader.profit_days, 30));
  v_expected_profit := round(p_amount_invested * v_roi / 100.0, 2);
  v_total_return  := round(p_amount_invested + v_expected_profit, 2);
  v_end           := v_start + (v_duration_days || ' days')::interval;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount_invested where id = p_user_id and balance >= p_amount_invested;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  insert into copy_trades (
    id, user_id, trader_id, trader_name, amount_invested, roi_percent,
    expected_profit, total_return, start_timestamp, end_timestamp,
    remaining_days, status, payout_completed, progress
  ) values (
    p_id, p_user_id, p_trader_id, v_trader.name, p_amount_invested, v_roi,
    v_expected_profit, v_total_return, v_start, v_end,
    v_duration_days, 'Running', false, 0
  );

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values ('tx-copy-' || p_id, p_user_id, 'investment', p_amount_invested, 'USD', 'completed', p_id, 'Copy trade: ' || v_trader.name);
end;
$function$;

-- -------------------------------------------------------
-- SECTION 4: Verify traders table has records
-- (Run SELECT below — if empty, traders must be inserted via Admin panel)
-- -------------------------------------------------------
select id, name, active, min_copy_amount, max_copy_amount, roi, profit_days
from traders
order by display_order;

-- -------------------------------------------------------
-- SECTION 6: Fix notifications RLS policies
-- -------------------------------------------------------
alter table if exists notifications enable row level security;

drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications
  for select
  using (
    lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', (select email from users where id = (auth.jwt() ->> 'sub'))))
    or audience = 'admin'
    or public.is_admin()
    or auth.role() = 'authenticated'
  );

drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications
  for insert
  with check (
    auth.role() = 'authenticated'
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', (select email from users where id = (auth.jwt() ->> 'sub'))))
    or audience = 'admin'
    or public.is_admin()
  );

drop policy if exists "notifications_update_own_or_admin" on notifications;
create policy "notifications_update_own_or_admin" on notifications
  for update
  using (
    auth.role() = 'authenticated'
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', (select email from users where id = (auth.jwt() ->> 'sub'))))
    or public.is_admin()
  );

drop policy if exists "notifications_delete_own_or_admin" on notifications;
create policy "notifications_delete_own_or_admin" on notifications
  for delete
  using (
    auth.role() = 'authenticated'
    or lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', (select email from users where id = (auth.jwt() ->> 'sub'))))
    or public.is_admin()
  );

-- -------------------------------------------------------
-- SECTION 7: Quick health check
-- -------------------------------------------------------
select
  (select count(*) from investment_plans where enabled = true and status = 'active') as active_plans,
  (select count(*) from traders where active = true or active is null)               as active_traders,
  (select count(*) from active_investments where status = 'Running')                 as running_investments,
  (select count(*) from copy_trades where status = 'Running')                        as running_copy_trades,
  (select count(*) from notifications)                                               as total_notifications;

