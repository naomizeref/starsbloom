-- Preserve both historical position labels for older and newer clients.
alter table public.active_investments add column if not exists name text;

-- create_investment RPC — schema-correct version (fixed 2026-08-29).
--
-- Root cause of the 400 / 23502 error:
--   The previous version tried to INSERT into columns that do NOT exist on
--   active_investments (name, remaining_days, daily_roi_percent) while
--   omitting the required NOT NULL column `plan_name`. This caused a
--   null-value constraint violation on every investment attempt.
--
-- This version matches the actual active_investments DDL in supabase_schema.sql:
--   id, user_id, plan_id, plan_name, name, amount, start_date, end_date,
--   roi_percent, expected_profit, total_return, accumulated_profit, status
--
-- SECURITY: all financial terms are recomputed server-side from the
-- investment_plans row — client-provided roi/profit/return values are
-- ignored so a user cannot fabricate an arbitrary payout.
--
-- Run this entire file in the Supabase SQL Editor. Safe to re-run.

create or replace function public.create_investment(
  p_id               text,
  p_user_id          text,
  p_plan_id          text,
  p_name             text,      -- kept in signature for backward-compat; ignored
  p_amount           numeric,
  p_roi_percent      numeric,   -- ignored; recomputed from plan row
  p_expected_profit  numeric,   -- ignored; recomputed
  p_total_return     numeric,   -- ignored; recomputed
  p_daily_roi_percent numeric,  -- ignored; not stored
  p_start_date       timestamptz,
  p_end_date         timestamptz,
  p_remaining_days   integer    -- ignored; not stored
) returns void language plpgsql security definer set search_path = public as $function$
declare
  v_caller  text := auth.jwt()->>'sub';
  v_plan    record;
  v_roi     numeric;
  v_duration integer;
  v_profit  numeric;
  v_total   numeric;
  v_start   timestamptz := now();
  v_end     timestamptz;
begin
  -- Auth guard
  if v_caller is null or v_caller <> p_user_id then
    raise exception 'You can only invest for your own account';
  end if;

  -- Source of truth: the plan row, NOT client-provided financial terms
  select * into v_plan from investment_plans where id = p_plan_id for share;
  if not found then
    raise exception 'Investment plan not found: %', p_plan_id;
  end if;
  if v_plan.enabled = false or v_plan.status <> 'active' then
    raise exception 'This investment plan is not available';
  end if;

  -- Amount validation
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Invalid investment amount';
  end if;
  if v_plan.min_deposit is not null and p_amount < v_plan.min_deposit then
    raise exception 'Below minimum deposit for this plan ($%)', v_plan.min_deposit;
  end if;
  if v_plan.max_deposit is not null and p_amount > v_plan.max_deposit then
    raise exception 'Above maximum deposit for this plan ($%)', v_plan.max_deposit;
  end if;

  -- Recompute financial terms from plan
  v_roi      := coalesce(v_plan.roi_percent, 0);
  v_duration := greatest(1, coalesce(v_plan.duration_days, 1));
  v_profit   := round(p_amount * v_roi / 100.0, 2);
  v_total    := round(p_amount + v_profit, 2);
  v_end      := v_start + (v_duration || ' days')::interval;

  -- Debit balance (bypass RLS protection trigger)
  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount
  where id = p_user_id and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  -- Insert investment record (only columns that exist in active_investments)
  insert into active_investments (
    id, user_id, plan_id, plan_name, name,
    amount, start_date, end_date,
    roi_percent, expected_profit, total_return,
    accumulated_profit, status
  ) values (
    p_id, p_user_id, p_plan_id, v_plan.name, v_plan.name,
    p_amount, v_start, v_end,
    v_roi, v_profit, v_total,
    0, 'Running'
  );

  -- Audit transaction
  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id, notes)
  values (
    p_id || '-tx',
    p_user_id,
    'investment',
    p_amount,
    'USD',
    'completed',
    p_id,
    'Investment: ' || v_plan.name
  );
end;
$function$;

-- Top-ups validate the amount before debiting; preserve purchased ROI and maturity.
create or replace function public.top_up_investment(p_investment_id text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_inv    record;
  v_caller text := auth.jwt()->>'sub';
  v_new_amount      numeric;
  v_expected_profit numeric;
  v_total_return    numeric;
begin
  if v_caller is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Invalid top-up amount: use a positive amount with at most two decimal places';
  end if;
  -- Lock in the same account/position order as payout and suspension.
  perform 1 from users where id=v_caller for update;
  select * into v_inv from active_investments where id = p_investment_id for update;
  if not found then
    raise exception 'Investment not found';
  end if;
  if v_inv.user_id <> v_caller then
    raise exception 'You can only top up your own investment';
  end if;
  if v_inv.status not in ('Running', 'active') or v_inv.payout_transaction_id is not null or now() >= v_inv.end_date then
    raise exception 'Completed investments cannot be topped up';
  end if;

  perform set_config('app.bypass_balance_protection', 'true', true);
  update users set balance = balance - p_amount where id = v_caller and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;

  v_new_amount      := v_inv.amount + p_amount;
  v_expected_profit := round(v_new_amount * (coalesce(v_inv.roi_percent, 0) / 100), 2);
  v_total_return    := v_new_amount + v_expected_profit;

  update active_investments
  set amount          = v_new_amount,
      expected_profit = v_expected_profit,
      total_return    = v_total_return,
      status          = 'Running'
  where id = p_investment_id;

  insert into transactions (id, user_id, type, amount, currency, status, related_reference_id)
  values (
    'tx-topup-' || p_investment_id || '-' || extract(epoch from now())::text,
    v_caller,
    'investment',
    p_amount,
    'USD',
    'completed',
    p_investment_id
  );
end;
$function$;
