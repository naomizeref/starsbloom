-- Apply AFTER the existing Bloom feature upgrade, first to a staging copy.
-- Keeps users.id, balances, roles, transactions and storage paths unchanged.
-- Configure the Clerk issuer separately using docs/clerk-auth-migration.md.
begin;
create schema if not exists bloom_auth;
revoke all on schema bloom_auth from public, anon, authenticated;

create table if not exists bloom_auth.issuers (
  issuer text primary key,
  provider text not null check (provider in ('supabase','clerk'))
);
insert into bloom_auth.issuers values
  ('https://pqbivesimvmzdwbrqprj.supabase.co/auth/v1','supabase'), ('supabase','supabase')
on conflict do nothing;

create table if not exists bloom_auth.identities (
  issuer text not null references bloom_auth.issuers(issuer),
  subject text not null,
  user_id text not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (issuer,subject), unique (issuer,user_id)
);
-- Not exposed by PostgREST, and no browser grants even if the schema is exposed later.
alter table bloom_auth.identities enable row level security;
alter table bloom_auth.issuers enable row level security;
revoke all on all tables in schema bloom_auth from public,anon,authenticated;

create or replace function public.bloom_current_user_id()
returns text language sql stable security definer set search_path = '' as $$
  select case when i.provider = 'supabase' then nullif(auth.jwt()->>'sub','')
    when i.provider = 'clerk' then (
      select m.user_id from bloom_auth.identities m
      where m.issuer=i.issuer and m.subject=auth.jwt()->>'sub'
    ) end
  from bloom_auth.issuers i where i.issuer=auth.jwt()->>'iss'
    and coalesce(auth.jwt()->>'sts','active') <> 'pending'
$$;
revoke all on function public.bloom_current_user_id() from public;
grant execute on function public.bloom_current_user_id() to anon,authenticated,service_role;

-- Only the backend can provision/link accounts after Clerk signature, issuer,
-- active session and verified-primary-email checks. Browser metadata is ignored.
create or replace function public.bloom_provision_clerk_user(
  p_issuer text, p_subject text, p_legacy_id text, p_email text, p_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id text; v_email text := lower(trim(p_email)); v_user public.users%rowtype;
begin
  if not exists(select 1 from bloom_auth.issuers where issuer=p_issuer and provider='clerk')
     or p_subject is null or p_subject !~ '^user_[a-zA-Z0-9]+$'
     or v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid identity configuration' using errcode='22023';
  end if;
  -- Serialize provisioning and email changes, including two tabs / two Clerk accounts.
  perform pg_advisory_xact_lock(hashtextextended('bloom-clerk-provision',0));
  select user_id into v_id from bloom_auth.identities where issuer=p_issuer and subject=p_subject;
  if v_id is not null and p_legacy_id is not null and v_id<>p_legacy_id then
    raise exception 'Account link conflict' using errcode='23505';
  end if;
  if v_id is null then
    if p_legacy_id is not null then
      select * into v_user from public.users where id=p_legacy_id for update;
      if not found or lower(v_user.email)<>v_email then
        raise exception 'Existing account link needs review' using errcode='23505';
      end if;
      v_id := v_user.id;
    else
      -- Never claim another Bloom account just by presenting its email address.
      if exists(select 1 from public.users where lower(email)=v_email) then
        raise exception 'Existing account link required' using errcode='23505';
      end if;
      v_id := gen_random_uuid()::text;
      insert into public.users(id,email,name,role,status,balance,portfolio_value,points,referral_count)
      values(v_id,v_email,left(p_name,200),'user','active',0,0,0,0);
    end if;
    insert into bloom_auth.identities(issuer,subject,user_id) values(p_issuer,p_subject,v_id);
  end if;
  if exists(select 1 from public.users where lower(email)=v_email and id<>v_id) then
    raise exception 'Email account link conflict' using errcode='23505';
  end if;
  -- A verified Clerk email change updates notifications, never roles or money.
  update public.users set email=v_email where id=v_id and email is distinct from v_email;
  select * into v_user from public.users where id=v_id;
  return jsonb_build_object('id',v_user.id,'email',v_user.email,'name',v_user.name);
end $$;
revoke all on function public.bloom_provision_clerk_user(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bloom_provision_clerk_user(text,text,text,text,text) to service_role;

-- Keep original definitions for inspection/recovery. CREATE OR REPLACE / ALTER
-- POLICY preserve owners, privileges, signatures and policy command/role settings.
create table if not exists bloom_auth.definition_backup (
  kind text not null, object_name text not null, definition text not null,
  primary key(kind,object_name)
);
revoke all on bloom_auth.definition_backup from public,anon,authenticated;

create or replace function bloom_auth.rewrite_identity(source text)
returns text language sql immutable set search_path='' as $fn$
  select regexp_replace(regexp_replace(regexp_replace(source,
    'auth\.uid\(\)[[:space:]]*::[[:space:]]*text', 'public.bloom_current_user_id()', 'gi'),
    'auth\.uid\(\)', '(public.bloom_current_user_id())::uuid', 'gi'),
    'auth\.jwt\(\)[[:space:]]*->>[[:space:]]*''sub''([[:space:]]*::[[:space:]]*text)?',
    'public.bloom_current_user_id()', 'gi')
$fn$;
revoke all on function bloom_auth.rewrite_identity(text) from public,anon,authenticated;

do $$ declare r record; original text; revised text; q text; c text; begin
  -- Transform only application-owned public functions. Never override auth.uid().
  for r in select p.oid, p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname not in ('bloom_current_user_id','bloom_provision_clerk_user')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop
    original := pg_get_functiondef(r.oid);
    revised := bloom_auth.rewrite_identity(original);
    if revised<>original then
      insert into bloom_auth.definition_backup values('function',r.signature,original) on conflict do nothing;
      execute revised;
    end if;
  end loop;
  for r in select * from pg_policies where schemaname in ('public','storage') loop
    q := bloom_auth.rewrite_identity(r.qual); c := bloom_auth.rewrite_identity(r.with_check);
    if q is distinct from r.qual or c is distinct from r.with_check then
      original := format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename)
        || case when r.qual is not null then ' using ('||r.qual||')' else '' end
        || case when r.with_check is not null then ' with check ('||r.with_check||')' else '' end;
      insert into bloom_auth.definition_backup values('policy',r.schemaname||'.'||r.tablename||'.'||r.policyname,original) on conflict do nothing;
      execute format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename)
        || case when q is not null then ' using ('||q||')' else '' end
        || case when c is not null then ' with check ('||c||')' else '' end;
    end if;
  end loop;
  -- Refuse a partial migration if an unfamiliar identity expression remains.
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not in ('bloom_current_user_id','bloom_provision_clerk_user')
    and (p.prosrc ~* 'auth\.uid' or p.prosrc ~* 'auth\.jwt\(\)[^;\n]*''sub'''))
    or exists(select 1 from pg_policies where schemaname in ('public','storage')
      and ((coalesce(qual,'')||coalesce(with_check,'')) ~* 'auth\.uid'
        or (coalesce(qual,'')||coalesce(with_check,'')) ~* 'auth\.jwt\(\)[^;\n]*''sub''')) then
    raise exception 'Unrecognized identity expression: review schema before enabling Clerk';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
