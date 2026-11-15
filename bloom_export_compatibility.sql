-- Added after review of Bloom's supplied SQL export (26 October 2026).
-- No account rows, holdings, roles, balances or past payouts are rewritten.
begin;

do $migration$ begin if to_regprocedure('public.create_investment(text,text,text,text,numeric,integer,numeric)') is not null then execute $definition$
CREATE OR REPLACE FUNCTION public.create_investment(p_id text, p_user_id text, p_plan_id text, p_plan_name text, p_amount numeric, p_duration_days integer, p_roi_percent numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $legacy$ begin perform public.create_investment(p_id,p_user_id,p_plan_id,p_plan_name,p_amount,0::numeric,0::numeric,0::numeric,0::numeric,now(),now(),0); end; $legacy$;
$definition$; end if; end $migration$;

do $migration$ begin if to_regprocedure('public.create_copy_trade(text,text,text,text,numeric,integer,numeric)') is not null then execute $definition$
CREATE OR REPLACE FUNCTION public.create_copy_trade(p_id text, p_user_id text, p_trader_id text, p_trader_name text, p_amount numeric, p_duration_days integer DEFAULT 30, p_roi_percent numeric DEFAULT 45)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $legacy$ begin perform public.create_copy_trade(p_id,p_user_id,p_trader_id,p_trader_name,p_amount,0::numeric,0::numeric,0::numeric,now(),now(),0); end; $legacy$;
$definition$; end if; end $migration$;

do $migration$ begin if to_regprocedure('public.buy_asset(text,text,text,numeric,numeric,text)') is not null then execute $definition$
CREATE OR REPLACE FUNCTION public.buy_asset(p_user_id text, p_symbol text, p_name text, p_quantity numeric, p_price numeric, p_asset_type text DEFAULT 'crypto'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_total numeric;
  v_price numeric;
  v_updated timestamptz;
  v_balance numeric;
  v_caller text := auth.uid()::text;
  v_pos record;
  v_new_amt numeric;
  v_new_avg numeric;
begin
  if v_caller is null or v_caller <> p_user_id then raise exception 'You can only trade your own account'; end if;
  perform public.require_active_account(p_user_id);
  if p_quantity is null or p_quantity <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid trade quantity'; end if;
  select price,updated_at into v_price,v_updated from public.market_prices where symbol=p_symbol;
  if v_price is null or v_price<=0 or v_price::text in ('NaN','Infinity','-Infinity') or v_updated is null or v_updated<now()-interval '15 minutes' then
    raise exception 'A fresh market price is required';
  end if;
  v_total := round(p_quantity*v_price,2);
  if v_total<=0 or v_total::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid trade value'; end if;
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
    values (p_user_id, p_symbol, p_name, p_quantity, v_price, p_asset_type);
  end if;

  insert into public.transactions (id, user_id, type, amount, currency, asset, status, notes)
  values (
    'tx-buy-' || gen_random_uuid()::text,
    p_user_id,
    'investment',
    v_total,
    'USD',
    p_symbol,
    'completed',
    'Bought ' || p_quantity || ' ' || p_symbol || ' @ $' || v_price
  );
end;
$function$
;
$definition$; end if; end $migration$;

do $migration$ begin if to_regprocedure('public.sell_asset(text,text,numeric,numeric)') is not null then execute $definition$
CREATE OR REPLACE FUNCTION public.sell_asset(p_user_id text, p_symbol text, p_quantity numeric, p_price numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_total numeric;
  v_price numeric;
  v_updated timestamptz;
  v_caller text := auth.uid()::text;
  v_pos record;
begin
  if v_caller is null or v_caller <> p_user_id then raise exception 'You can only trade your own account'; end if;
  perform public.require_active_account(p_user_id);
  if p_quantity is null or p_quantity <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid trade quantity'; end if;
  select price,updated_at into v_price,v_updated from public.market_prices where symbol=p_symbol;
  if v_price is null or v_price<=0 or v_price::text in ('NaN','Infinity','-Infinity') or v_updated is null or v_updated<now()-interval '15 minutes' then
    raise exception 'A fresh market price is required';
  end if;
  v_total := round(p_quantity*v_price,2);
  if v_total<=0 or v_total::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid trade value'; end if;
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
    'tx-sell-' || gen_random_uuid()::text,
    p_user_id,
    'payout',
    v_total,
    'USD',
    p_symbol,
    'completed',
    'Sold ' || p_quantity || ' ' || p_symbol || ' @ $' || v_price
  );
end;
$function$
;
$definition$; end if; end $migration$;

-- Old portfolio clients keep their own table. No automatic merge with portfolio_assets.
do $$ declare op text; begin
  if to_regclass('public.portfolio_positions') is not null then
    foreach op in array array['insert','update','delete'] loop
      execute format('drop policy if exists bloom_legacy_rpc_%s on public.portfolio_positions',op);
      execute format('create policy bloom_legacy_rpc_%s on public.portfolio_positions as restrictive for %s to public %s',op,op,case when op='insert' then 'with check (false)' else 'using (false)' end);
    end loop;
  end if;
end $$;

-- A broad permissive policy must not expose another account's notifications.
create or replace function public.owns_bloom_notification(p_owner text,p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users where id=auth.jwt()->>'sub'
    and (id=p_owner or lower(email)=lower(p_email)));
$$;
revoke all on function public.owns_bloom_notification(text,text) from public;
grant execute on function public.owns_bloom_notification(text,text) to authenticated,anon;
do $$ declare op text; begin
  foreach op in array array['select','update','delete'] loop
    execute format('drop policy if exists bloom_notification_%s_guard on public.notifications',op);
    execute format('create policy bloom_notification_%s_guard on public.notifications as restrictive for %s to public using (public.is_admin() or public.owns_bloom_notification(user_id,recipient_email))',op,op);
  end loop;
end $$;

-- Preserve self-notifications and user requests addressed to a real admin,
-- without allowing one user to write notifications to another regular account.
create or replace function public.can_submit_bloom_notification(p_owner text,p_email text,p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users caller where caller.id=auth.jwt()->>'sub'
    and (p_owner is null or p_owner=caller.id)
    and (lower(p_email)=lower(caller.email) or
      (p_audience='admin' and exists(select 1 from public.users recipient where recipient.role='admin' and lower(recipient.email)=lower(p_email)))));
$$;
revoke all on function public.can_submit_bloom_notification(text,text,text) from public;
grant execute on function public.can_submit_bloom_notification(text,text,text) to authenticated,anon;
drop policy if exists bloom_notification_insert_guard on public.notifications;
create policy bloom_notification_insert_guard on public.notifications as restrictive for insert to public
with check (public.is_admin() or public.can_submit_bloom_notification(user_id,recipient_email,audience));
create or replace function public.guard_bloom_notification_recipient()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and not public.is_admin()
    and row(new.user_id,new.recipient_email,new.audience) is distinct from row(old.user_id,old.recipient_email,old.audience) then
    raise exception 'Notification recipients cannot be changed.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_bloom_notification_recipient on public.notifications;
create trigger guard_bloom_notification_recipient before update on public.notifications
for each row execute function public.guard_bloom_notification_recipient();

-- Reviews are admin operations. Owners cannot reopen paid claims or erase history.
drop policy if exists bloom_claim_update_guard on public.airdrop_claims;
create policy bloom_claim_update_guard on public.airdrop_claims as restrictive for update to public using (public.is_admin()) with check (public.is_admin());
drop policy if exists bloom_claim_delete_guard on public.airdrop_claims;
create policy bloom_claim_delete_guard on public.airdrop_claims as restrictive for delete to public using (public.is_admin());

-- Validate new claims against the authoritative campaign under a row lock.
-- Do not rewrite or auto-credit ambiguous historical claims.
create or replace function public.guard_bloom_airdrop_submission()
returns trigger language plpgsql security definer set search_path=public as $$
declare campaign public.airdrops%rowtype; reward numeric;
begin
  if new.user_id is distinct from auth.jwt()->>'sub' or new.status is distinct from 'Pending'
     or new.reviewed_at is not null or new.payout_transaction_id is not null then
    raise exception 'Submit only your own pending airdrop claim.' using errcode='42501';
  end if;
  select * into campaign from public.airdrops where id=new.airdrop_id for update;
  if not found then raise exception 'An existing airdrop campaign is required.'; end if;
  if campaign.enabled=false or campaign.status in ('disabled','ended') or
     (nullif(campaign.start_date,'') is not null and campaign.start_date::date>current_date) or
     (nullif(campaign.end_date,'') is not null and campaign.end_date::date<current_date) then
    raise exception 'This airdrop campaign is not available.';
  end if;
  reward := nullif(campaign.reward_amount,'')::numeric;
  if reward is null or reward<=0 or reward::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid campaign reward.'; end if;
  if exists(select 1 from public.airdrop_claims where user_id=new.user_id and airdrop_id=new.airdrop_id) then raise exception 'You have already claimed this campaign.'; end if;
  if campaign.claim_limit>0 and (select count(*) from public.airdrop_claims where airdrop_id=new.airdrop_id and status<>'Rejected')>=campaign.claim_limit then raise exception 'The campaign claim limit has been reached.'; end if;
  new.token := campaign.token; new.reward_amount := campaign.reward_amount; new.campaign_title := campaign.title;
  return new;
end $$;
drop trigger if exists guard_bloom_airdrop_submission on public.airdrop_claims;
create trigger guard_bloom_airdrop_submission before insert on public.airdrop_claims
for each row execute function public.guard_bloom_airdrop_submission();

CREATE OR REPLACE FUNCTION public.approve_airdrop_claim(p_claim_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_reward is null or v_reward<=0 or v_reward::text in ('NaN','Infinity','-Infinity') then
    raise exception 'This claim needs campaign reward reconciliation before approval.';
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
$function$
;

notify pgrst, 'reload schema';
commit;
