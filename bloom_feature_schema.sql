-- Compatibility for Bloom installations that have run the historical core/master
-- migrations. Run before the Orbitrio feature migrations; no balances change.
begin;
alter table public.active_investments
  add column if not exists name text,
  add column if not exists plan_name text,
  add column if not exists remaining_days integer default 0,
  add column if not exists progress numeric default 0,
  add column if not exists completed_at timestamptz,
  add column if not exists payout_transaction_id text;
update public.active_investments set name = coalesce(name,plan_name), plan_name = coalesce(plan_name,name)
where name is null or plan_name is null;
alter table public.copy_trades
  add column if not exists remaining_days integer default 0,
  add column if not exists progress numeric default 0;
alter table public.kyc_submissions
  add column if not exists id_type text,
  add column if not exists id_number text,
  add column if not exists dob text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists front_image text,
  add column if not exists back_image text,
  add column if not exists proof_of_address_image text,
  add column if not exists submission_date timestamptz default now(),
  add column if not exists admin_notes text default '';
commit;
