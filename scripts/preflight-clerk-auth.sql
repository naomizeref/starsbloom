-- Read-only readiness counts; no emails, hashes, balances or private documents.
select jsonb_build_object(
  'bloom_accounts',(select count(*) from public.users),
  'auth_accounts',(select count(*) from auth.users),
  'auth_accounts_without_profile',(select count(*) from auth.users a where not exists(select 1 from public.users u where u.id=a.id::text)),
  'profiles_without_legacy_auth',(select count(*) from public.users u where not exists(select 1 from auth.users a where a.id::text=u.id)),
  'unverified_legacy_accounts',(select count(*) from auth.users where email_confirmed_at is null),
  'mapped_clerk_accounts',(select count(distinct user_id) from bloom_auth.identities),
  'unmapped_existing_accounts',(select count(*) from public.users u where not exists(select 1 from bloom_auth.identities m where m.user_id=u.id)),
  'mapped_admins',(select count(distinct u.id) from public.users u join bloom_auth.identities m on m.user_id=u.id where u.role='admin' and u.status='active'),
  'configured_clerk_issuers',(select count(*) from bloom_auth.issuers where provider='clerk'),
  'remaining_uid_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ~* 'auth\.uid\('),
  'duplicate_account_emails',(select count(*) from (select lower(email) from public.users group by lower(email) having count(*)>1) s)
) as clerk_preflight;
