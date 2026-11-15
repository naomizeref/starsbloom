-- =============================================================================
-- FIX: deposit_wallets column mismatch — app wrote `deposit_instructions`,
-- live schema has `instructions`. Every admin wallet save silently failed.
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 1. Make sure the canonical column exists.
alter table public.deposit_wallets
  add column if not exists instructions text default '';

-- 2. If a legacy `deposit_instructions` column exists, carry its data over,
--    then drop it so the schema stays unambiguous.
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

-- 3. Re-assert access: public read (frontend deposit page), admin-only writes.
drop policy if exists "deposit_wallets_public_select" on public.deposit_wallets;
create policy "deposit_wallets_public_select" on public.deposit_wallets
  for select using (true);

drop policy if exists "deposit_wallets_admin_insert" on public.deposit_wallets;
create policy "deposit_wallets_admin_insert" on public.deposit_wallets
  for insert with check (public.is_admin());

drop policy if exists "deposit_wallets_admin_update" on public.deposit_wallets;
create policy "deposit_wallets_admin_update" on public.deposit_wallets
  for update using (public.is_admin());

drop policy if exists "deposit_wallets_admin_delete" on public.deposit_wallets;
create policy "deposit_wallets_admin_delete" on public.deposit_wallets
  for delete using (public.is_admin());