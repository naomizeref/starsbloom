import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { restoreExport } from './helpers/restore-export.mjs';
import { seedExportScenarios, runExportScenarios, financialSnapshot, fixtureUser } from '../scripts/schema-export-scenarios.mjs';
import { buildFeatureMigration } from '../scripts/feature-migrations.mjs';

test('Clerk migration preserves funds, enforces identity mapping, and retains both providers', async () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  const clerkIssuer = 'https://clerk.joinbloom.online';
  const legacyIssuer = 'https://pqbivesimvmzdwbrqprj.supabase.co/auth/v1';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const subject = (id: string) => `user_${id.replaceAll('-', '')}`;
  const asClerk = async (id: string, issuer = clerkIssuer) => {
    await db.exec('reset role');
    await db.query("select set_config('test.jwt',$1,false)", [JSON.stringify({sub:subject(id),iss:issuer,role:'authenticated'})]);
    await db.exec('set role authenticated');
  };
  try {
    await restoreExport(db, JSON.parse(await readFile(new URL('./fixtures/bloom-export-2026-10-26.json', import.meta.url), 'utf8')));
    await seedExportScenarios(db);
    await db.exec(await buildFeatureMigration());
    const saved = await financialSnapshot(db);
    const migration = await readFile(new URL('../clerk_auth_migration.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(await financialSnapshot(db), saved);
    await db.query("insert into bloom_auth.issuers values($1,'clerk')", [clerkIssuer]);
    const activation = await readFile(new URL('../scripts/activate-clerk-auth.sql',import.meta.url),'utf8');
    await assert.rejects(db.exec(activation),/cutover blocked/);
    await db.exec('rollback');
    for (const [id,email] of [[fixtureUser,'schema-user@example.invalid'],[adminId,'schema-admin@example.invalid'],[otherId,'schema-other@example.invalid']]) {
      await db.query('select bloom_provision_clerk_user($1,$2,$3,$4,$5)', [clerkIssuer,subject(id),id,email,'Imported']);
    }
    await db.exec("insert into auth.users(id,email) values('44444444-4444-4444-8444-444444444444','missing@example.invalid')");
    await assert.rejects(db.exec(activation),/Auth accounts still lack Bloom profiles/);
    await db.exec('rollback');
    await db.exec("delete from auth.users where id='44444444-4444-4444-8444-444444444444'");
    assert.deepEqual(await financialSnapshot(db), saved);
    await assert.rejects(db.query('select bloom_provision_clerk_user($1,$2,null,$3,$4)',[clerkIssuer,'user_attacker','schema-user@example.invalid','Attacker']),/link required/);
    await assert.rejects(db.query('select bloom_provision_clerk_user($1,$2,$3,$4,$5)',[clerkIssuer,'user_attacker',adminId,'attacker@example.invalid','Attacker']),/link needs review/);
    await db.exec(`insert into storage.objects(bucket_id,name) values('deposit-proofs','${otherId}/private.png')`);
    await asClerk(fixtureUser);
    await db.exec(`insert into storage.objects(bucket_id,name) values('deposit-proofs','${fixtureUser}/own.png')`);
    assert.equal((await db.query("select name from storage.objects where bucket_id='deposit-proofs'")).rows.length,1,'Private proof paths retain the Bloom ID and isolate other users');
    assert.equal((await db.query<{id:string}>('select bloom_current_user_id() as id')).rows[0].id,fixtureUser);
    assert.equal((await db.query('select id from users')).rows.length,1,'Users cannot read other accounts');
    await assert.rejects(db.exec(`update users set role='admin',balance=999999 where id='${fixtureUser}'`),/managed/);
    await assert.rejects(db.exec(`select bloom_provision_clerk_user('${clerkIssuer}','user_forge','${adminId}','schema-admin@example.invalid','Fake')`),/permission denied/);
    await assert.rejects(db.exec('select * from bloom_auth.identities'),/permission denied/);
    await asClerk(adminId);
    assert.equal((await db.query<{admin:boolean}>('select is_admin() as admin')).rows[0].admin,true);
    await asClerk(fixtureUser,'https://wrong-clerk.example.invalid');
    assert.equal((await db.query<{id:string}>('select bloom_current_user_id() as id')).rows[0].id,null);
    assert.equal((await db.query('select id from users')).rows.length,0);
    await asClerk('unmapped');
    assert.equal((await db.query<{id:string}>('select bloom_current_user_id() as id')).rows[0].id,null);
    await db.exec('reset role');
    const fresh = (await db.query<{account:any}>('select bloom_provision_clerk_user($1,$2,null,$3,$4) as account',[clerkIssuer,'user_new','new@example.invalid','New'])).rows[0].account;
    const again = (await db.query<{account:any}>('select bloom_provision_clerk_user($1,$2,null,$3,$4) as account',[clerkIssuer,'user_new','new@example.invalid','New'])).rows[0].account;
    assert.equal(fresh.id,again.id,'Provisioning is idempotent');
    assert.equal((await db.query<{role:string}>(`select role from users where id='${fresh.id}'`)).rows[0].role,'user');
    // Run the existing real-money regression scenarios under each provider.
    for (const provider of ['supabase','clerk']) {
      const result = await runExportScenarios(db,provider,id => provider==='clerk'
        ? { sub:subject(id), iss:clerkIssuer } : { sub:id, iss:legacyIssuer });
      assert.equal(result.failed,0,JSON.stringify(result.results.filter(r => !r.passed)));
    }
    await db.exec(activation);
    await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({sub:fixtureUser,iss:legacyIssuer,role:'authenticated'})]);
    await db.exec('set role authenticated');
    assert.equal((await db.query<{id:string}>('select bloom_current_user_id() as id')).rows[0].id,null,'Final activation prevents legacy sessions bypassing Clerk');
    await asClerk(fixtureUser);
    assert.equal((await db.query<{id:string}>('select bloom_current_user_id() as id')).rows[0].id,fixtureUser);
  } finally { await db.close(); }
});

test('missing-profile repair preserves existing accounts and refuses ambiguous or banned identities', async () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  const missingId = '44444444-4444-4444-8444-444444444444';
  const conflictId = '55555555-5555-4555-8555-555555555555';
  const repair = await readFile(new URL('../scripts/reconcile-clerk-profiles.sql',import.meta.url),'utf8');
  const exportSql = await readFile(new URL('../scripts/export-clerk-users.sql',import.meta.url),'utf8');
  try {
    await restoreExport(db, JSON.parse(await readFile(new URL('./fixtures/bloom-export-2026-10-26.json',import.meta.url),'utf8')));
    await seedExportScenarios(db);
    await db.exec(await buildFeatureMigration());
    await db.exec('alter table auth.users add column banned_until timestamptz, add column email_confirmed_at timestamptz, add column encrypted_password text');
    const originalProfiles = (await db.query('select * from public.users order by id')).rows;
    const saved = await financialSnapshot(db);
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`,
      [missingId,'missing@example.invalid',JSON.stringify({first_name:' New ',last_name:{invalid:true},role:'admin',balance:999999,points:999999})]);
    const originalAuth = (await db.query('select * from auth.users order by id')).rows;
    await assert.rejects(db.exec(exportSql),/Export blocked/);
    await db.exec('rollback');
    await db.exec(repair);
    assert.deepEqual((await db.query('select * from public.users where id<>$1 order by id',[missingId])).rows,originalProfiles);
    assert.deepEqual((await db.query('select * from auth.users order by id')).rows,originalAuth,'Repair must not change email verification or Auth records');
    const profile = (await db.query<any>('select * from public.users where id=$1',[missingId])).rows[0];
    assert.equal(profile.role,'user');
    assert.equal(profile.status,'active');
    assert.equal(Number(profile.balance),0);
    assert.equal(Number(profile.portfolio_value),0);
    assert.equal(profile.points,0);
    assert.equal(profile.referral_count,0);
    assert.equal(profile.first_name,'New');
    assert.equal(profile.last_name,null);
    // Financial tables and original accounts remain unchanged; only one profile is added.
    await db.exec(repair);
    assert.deepEqual((await db.query('select * from public.users where id=$1',[missingId])).rows[0],profile,'Rerunning does not reset a profile');
    await db.exec(exportSql);
    await db.query('delete from public.users where id=$1',[missingId]);
    assert.deepEqual(await financialSnapshot(db),saved);

    for (const email of ['SCHEMA-USER@example.invalid','MISSING@example.invalid',null,'invalid email']) {
      await db.query('insert into auth.users(id,email) values($1,$2)',[conflictId,email]);
      await assert.rejects(db.exec(repair),/Profile repair blocked/);
      await db.exec('rollback');
      assert.deepEqual((await db.query('select * from public.users order by id')).rows,originalProfiles,'A conflict rolls back the entire repair');
      await db.query('delete from auth.users where id=$1',[conflictId]);
    }
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[missingId]);
    await assert.rejects(db.exec(repair),/banned Auth account/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from public.users order by id')).rows,originalProfiles);
  } finally { await db.close(); }
});
