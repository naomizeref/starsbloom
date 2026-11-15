-- Run in the TEST Supabase SQL editor before retrying KYC review.
-- Matches the existing Bloom helper: the authenticated subject must have role='admin'.
-- CREATE OR REPLACE preserves the function's owner and existing execution grants.
-- No user roles, balances, KYC records, or storage objects are changed.
begin;

-- The old helper trusted JWT metadata/email. Do not switch an occupied project
-- to database roles if that would leave it without any administrator.
do $$ begin
  if exists(select 1 from public.users) and not exists(select 1 from public.users where role='admin') then
    raise exception 'No database-backed administrator exists. Reconcile the intended admin account through trusted SQL before this upgrade; no roles were changed.';
  end if;
end $$;

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

commit;
