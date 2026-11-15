-- FINAL CUTOVER ONLY: after importing every account, deploying Clerk mode,
-- and testing a real admin/user login. Old Supabase sessions lose data access.
-- Keep a database backup. See docs/clerk-auth-migration.md for rollback limits.
begin;
do $$ begin
  if exists(select 1 from auth.users a where not exists(select 1 from public.users u where u.id=a.id::text)) then
    raise exception 'Clerk cutover blocked: Auth accounts still lack Bloom profiles.';
  end if;
  if not exists(select 1 from bloom_auth.issuers where issuer='https://clerk.joinbloom.online' and provider='clerk')
     or exists(select 1 from public.users u where not exists(
       select 1 from bloom_auth.identities m where m.user_id=u.id and m.issuer='https://clerk.joinbloom.online'))
     or not exists(select 1 from public.users u join bloom_auth.identities m on m.user_id=u.id
       where u.role='admin' and u.status='active' and m.issuer='https://clerk.joinbloom.online') then
    raise exception 'Clerk cutover blocked: link every existing account and at least one active admin first.';
  end if;
end $$;
-- Prevent the old password flow from bypassing Clerk account security/MFA.
delete from bloom_auth.issuers where provider='supabase';
commit;
