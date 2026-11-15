-- BEFORE EXPORT: run in Bloom's SQL editor after taking a database backup.
-- Creates only missing profiles, preserving Auth IDs. Never merges by email.
-- Briefly blocks account/profile writes; all changes roll back on a conflict.
begin;
lock table auth.users in share mode;
lock table public.users in share row exclusive mode;

do $$ begin
  if exists (
    select 1 from auth.users a
    where not exists(select 1 from public.users u where u.id=a.id::text)
      and (a.email is null or a.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or coalesce(a.banned_until>now(),false))
  ) then
    raise exception 'Profile repair blocked: missing profiles include an invalid email or banned Auth account; review before proceeding.';
  end if;
  if exists (
    select 1 from auth.users a
    where not exists(select 1 from public.users u where u.id=a.id::text)
      and (exists(select 1 from public.users u where lower(btrim(u.email))=lower(btrim(a.email)))
        or exists(select 1 from auth.users b where b.id<>a.id and lower(btrim(b.email))=lower(btrim(a.email))))
  ) then
    raise exception 'Profile repair blocked: conflicting account emails require review; no accounts were merged.';
  end if;
end $$;

with inserted as (
  insert into public.users(id,email,first_name,last_name,role,status,balance,portfolio_value,points,referral_count)
  select a.id::text,a.email,
    case when jsonb_typeof(a.raw_user_meta_data->'first_name')='string'
      then nullif(left(btrim(a.raw_user_meta_data->>'first_name'),100),'') end,
    case when jsonb_typeof(a.raw_user_meta_data->'last_name')='string'
      then nullif(left(btrim(a.raw_user_meta_data->>'last_name'),100),'') end,
    'user','active',0,0,0,0
  from auth.users a
  where not exists(select 1 from public.users u where u.id=a.id::text)
  on conflict(id) do nothing
  returning id
)
select count(*) as profiles_created from inserted;

select count(*) as auth_accounts_without_profile
from auth.users a where not exists(select 1 from public.users u where u.id=a.id::text);
commit;
