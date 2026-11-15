-- READ ONLY. Run in each project's Supabase SQL editor and export the result.
-- Contains database definitions and privileges, not user rows or credentials.
-- Review custom function bodies for any hard-coded secrets before sharing.
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
  'columns', (select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'),
  'constraints', (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)))
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
  'indexes', (select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname='public'),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('public','storage')),
  'triggers', (select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and not t.tgisinternal),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'privileges',p.proacl))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')),
  'table_grants', (select jsonb_agg(to_jsonb(g)) from information_schema.table_privileges g where table_schema in ('public','storage')),
  'extensions', (select jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) from pg_extension)
)) as schema_export;
