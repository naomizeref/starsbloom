-- SENSITIVE EXPORT: contains password hashes. Download as JSON to a private
-- location OUTSIDE the repository. Do not paste into chat, logs, or commit it.
-- This is read-only. Take a database backup before the migration.
-- Prevent a partial export that silently excludes Auth-only accounts.
begin transaction isolation level repeatable read read only;
do $$ begin
  if exists(select 1 from auth.users a where not exists(select 1 from public.users u where u.id=a.id::text)) then
    raise exception 'Export blocked: Auth accounts lack Bloom profiles. Review and run scripts/reconcile-clerk-profiles.sql first.';
  end if;
end $$;
select coalesce(jsonb_agg(jsonb_build_object(
  'id',u.id, 'email',u.email, 'passwordDigest',a.encrypted_password,
  'emailVerified',a.email_confirmed_at is not null,
  'authEmailMatches',lower(u.email)=lower(a.email),
  'banned',coalesce(a.banned_until>now(),false),
  'firstName',u.first_name, 'lastName',u.last_name
) order by u.id),'[]'::jsonb) as clerk_users
from public.users u left join auth.users a on a.id::text=u.id;
commit;
