import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {restoreExport} from './helpers/restore-export.mjs';
import {seedExportScenarios,runExportScenarios,financialSnapshot} from '../scripts/schema-export-scenarios.mjs';
import {buildFeatureMigration} from '../scripts/feature-migrations.mjs';
test('supplied Bloom schema preserves existing funds and closes legacy RPC/policy bypasses',async()=>{
 const schema=JSON.parse(await readFile(new URL('./fixtures/bloom-export-2026-10-26.json',import.meta.url),'utf8'));
 const db=new PGlite({extensions:{uuid_ossp}});
 try {
  await restoreExport(db,schema);await seedExportScenarios(db);
  await db.exec("insert into storage.buckets(id,name,public) values('deposit-proofs','deposit-proofs',false); insert into storage.objects(bucket_id,name) values('deposit-proofs','existing/proof.png')");
  const preflight=await readFile(new URL('../scripts/preflight-bloom-upgrade.sql',import.meta.url),'utf8');
  await db.exec('begin read only');await db.exec(preflight);await db.exec('rollback');
  const before=await runExportScenarios(db,'exported_schema');
  assert.ok(before.failed>0,'The fixture must reproduce the supplied schema vulnerabilities');
  const saved=await financialSnapshot(db);
  const upgrade=await buildFeatureMigration();
  await db.exec("update users set role='user' where id='22222222-2222-4222-8222-222222222222'");
  await assert.rejects(db.exec(upgrade),/No database-backed administrator/);
  await db.exec('rollback');
  await db.exec("update users set role='admin' where id='22222222-2222-4222-8222-222222222222'");
  await db.exec(upgrade);await db.exec(upgrade);
  const bucket = (await db.query<{public:boolean;file_size_limit:number;allowed_mime_types:string[]}>("select public,file_size_limit,allowed_mime_types from storage.buckets where id='deposit-proofs'")).rows[0];
  assert.equal(bucket.public,false);
  assert.equal(Number(bucket.file_size_limit),5242880);
  assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
  assert.equal((await db.query<{n:number}>("select count(*)::int as n from storage.objects where name='existing/proof.png'")).rows[0].n,1);
  assert.deepEqual(await financialSnapshot(db),saved,'Retain existing synthetic balances, both holdings tables, ledger and investment terms');
  const after=await runExportScenarios(db,'prepared_upgrade');
  assert.equal(after.failed,0,JSON.stringify(after.results.filter(r=>!r.passed),null,2));
 }finally{await db.close();}
});
