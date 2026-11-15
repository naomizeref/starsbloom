// Offline-only restoration of the metadata produced by export-schema.sql.
// Restores definitions, never production rows. Run only against a disposable PGlite instance.
export const quoteIdentifier = value => '"' + String(value).replaceAll('"','""') + '"';
export async function restoreExport(db, schema) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create function storage.extension(text) returns text language sql immutable as $$select reverse(split_part(reverse($1),'.',1))$$;
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon,service_role;
    create extension if not exists "uuid-ossp";`);
  for (const t of schema.tables) {
    if(t.schema!=='public') throw new Error('Only public table definitions are supported');
    const columns=schema.columns.filter(c=>c.table_name===t.name).sort((a,b)=>a.ordinal_position-b.ordinal_position);
    const defs=columns.map(c=>`${quoteIdentifier(c.column_name)} ${c.data_type}${c.data_type==='numeric'&&c.numeric_precision?`(${c.numeric_precision},${c.numeric_scale||0})`:''}${c.column_default?` default ${c.column_default}`:''}${c.is_nullable==='NO'?' not null':''}`);
    await db.exec(`create table public.${quoteIdentifier(t.name)} (${defs.join(',')})`);
  }
  // Unique/primary keys must precede referencing foreign keys.
  for(const c of [...schema.constraints].sort((a,b)=>Number(a.definition.startsWith('FOREIGN'))-Number(b.definition.startsWith('FOREIGN')))) {
    await db.exec(`alter table ${c.table} add constraint ${quoteIdentifier(c.name)} ${c.definition}`);
  }
  for(const i of schema.indexes) await db.exec(i.indexdef.replace(/CREATE (UNIQUE )?INDEX /,'CREATE $1INDEX IF NOT EXISTS '));
  await db.exec('set check_function_bodies = off');
  for(const f of schema.functions) await db.exec(f.definition);
  await db.exec('set check_function_bodies = on');
  for(const p of schema.policies) {
    await db.exec(`create policy ${quoteIdentifier(p.policyname)} on ${quoteIdentifier(p.schemaname)}.${quoteIdentifier(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quoteIdentifier).join(',')}${p.qual?` using (${p.qual})`:''}${p.with_check?` with check (${p.with_check})`:''}`);
  }
  for(const t of schema.tables) if(t.rls) await db.exec(`alter table public.${quoteIdentifier(t.name)} enable row level security${t.force_rls?`; alter table public.${quoteIdentifier(t.name)} force row level security`:''}`);
  for(const t of schema.triggers) await db.exec(t.definition);
  // The export does not include storage internals' table definitions. Only
  // buckets/objects are modeled; storage engine integration still needs staging.
  for(const g of schema.table_grants.filter(g=>g.table_schema==='public'||['buckets','objects'].includes(g.table_name))) await db.exec(`grant ${g.privilege_type} on ${quoteIdentifier(g.table_schema)}.${quoteIdentifier(g.table_name)} to ${quoteIdentifier(g.grantee)}`);
  // Exported functions in this snapshot all grant EXECUTE to PUBLIC and the app roles.
  // Refuse to silently approximate a future export with a different ACL.
  for(const f of schema.functions) {
    if(f.privileges && !f.privileges.some(a=>a.startsWith('=X/'))) throw new Error(`Unsupported non-public function ACL: ${f.name}`);
  }
}
