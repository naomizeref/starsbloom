-- Apply after the feature migrations. Supabase Auth identity is auth.jwt()->>'sub'.
-- Protect the new suspension/review boundaries even on Bloom installations with
-- legacy policies that allow users to update their entire profile or ledger.
begin;

create or replace function public.guard_bloom_profile_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Trusted SQL and SECURITY DEFINER money RPCs run as the function/table owner.
  -- Direct PostgREST requests run as authenticated/anon; JWT metadata is not authority.
  if current_user not in ('authenticated', 'anon') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'user' or new.status is distinct from 'active'
       or coalesce(new.balance, 0) <> 0 or coalesce(new.points, 0) <> 0
       or coalesce(new.portfolio_value, 0) <> 0 or coalesce(new.referral_count, 0) <> 0 then
      raise exception 'Account permissions and balances are managed by the platform.' using errcode='42501';
    end if;
  elsif row(new.id, new.email, new.role, new.status, new.balance, new.points, new.portfolio_value, new.referral_count)
    is distinct from row(old.id, old.email, old.role, old.status, old.balance, old.points, old.portfolio_value, old.referral_count) then
    raise exception 'Account permissions and balances are managed by the platform.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_bloom_profile_fields on public.users;
create trigger guard_bloom_profile_fields before insert or update on public.users
for each row execute function public.guard_bloom_profile_fields();

create or replace function public.guard_bloom_transaction_submission()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.type in ('deposit','withdrawal','investment','payout') and
     (new.amount is null or new.amount <= 0 or new.amount::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Transaction amount must be finite and positive.';
  end if;
  if current_user in ('authenticated','anon') and not public.is_admin() and
     (new.user_id is distinct from auth.jwt()->>'sub' or new.type is distinct from 'deposit' or new.status is distinct from 'pending') then
    raise exception 'Only pending deposits can be submitted directly. Use the financial action endpoint.' using errcode='42501';
  end if;
  if new.type = 'withdrawal' and not exists (
    select 1 from public.kyc_submissions where user_id = new.user_id and status = 'approved'
  ) then
    raise exception 'Account Verification Required. Complete KYC before requesting a withdrawal.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_bloom_transaction_submission on public.transactions;
create trigger guard_bloom_transaction_submission before insert on public.transactions
for each row execute function public.guard_bloom_transaction_submission();

-- Existing broad policies must not let a client bypass server-calculated
-- principal, ROI, prices, maturity, or payouts. Owner/admin reads still work.
do $$ declare t text; begin
  foreach t in array array['active_investments','copy_trades','portfolio_assets'] loop
    execute format('drop policy if exists bloom_rpc_insert_only on public.%I', t);
    execute format('create policy bloom_rpc_insert_only on public.%I as restrictive for insert to authenticated with check (false)', t);
    execute format('drop policy if exists bloom_rpc_update_only on public.%I', t);
    execute format('create policy bloom_rpc_update_only on public.%I as restrictive for update to authenticated using (false)', t);
    execute format('drop policy if exists bloom_rpc_delete_only on public.%I', t);
    execute format('create policy bloom_rpc_delete_only on public.%I as restrictive for delete to authenticated using (false)', t);
  end loop;
end $$;
-- Ledger review is admin-only; other users cannot complete or erase their own deposits.
drop policy if exists bloom_ledger_update_guard on public.transactions;
create policy bloom_ledger_update_guard on public.transactions as restrictive for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists bloom_ledger_delete_guard on public.transactions;
create policy bloom_ledger_delete_guard on public.transactions as restrictive for delete to authenticated using (public.is_admin());
-- Older schemas cascade trader deletion into funded positions. Preserve both
-- active positions and history; admins can disable catalog entries instead.
create or replace function public.preserve_position_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'traders' then
    if exists(select 1 from public.copy_trades where trader_id=old.id) then
      raise exception 'This trader has existing positions. Disable the trader instead of deleting it.';
    end if;
  elsif exists(select 1 from public.active_investments where plan_id=old.id) then
    raise exception 'This plan has existing positions. Disable the plan instead of deleting it.';
  end if;
  return old;
end;
$$;
revoke all on function public.preserve_position_catalog() from public;
drop trigger if exists preserve_position_catalog on public.traders;
create trigger preserve_position_catalog before delete on public.traders for each row execute function public.preserve_position_catalog();
drop trigger if exists preserve_position_catalog on public.investment_plans;
create trigger preserve_position_catalog before delete on public.investment_plans for each row execute function public.preserve_position_catalog();

notify pgrst, 'reload schema';
commit;
