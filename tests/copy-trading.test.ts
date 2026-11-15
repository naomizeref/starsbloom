import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { restoreExport } from './helpers/restore-export.mjs';
import { seedExportScenarios, fixtureUser } from '../scripts/schema-export-scenarios.mjs';
import { buildFeatureMigration } from '../scripts/feature-migrations.mjs';

test('copy allocations prevent duplicate debits, enforce capacity and preserve settlement', async () => {
 const db = new PGlite({ extensions: { uuid_ossp } });
 const other = '33333333-3333-4333-8333-333333333333';
 try {
  await restoreExport(db, JSON.parse(await readFile(new URL('./fixtures/bloom-export-2026-10-26.json', import.meta.url),'utf8')));
  await seedExportScenarios(db); await db.exec(await buildFeatureMigration());
  const asUser = (id: string) => db.query("select set_config('test.jwt',$1,false)", [JSON.stringify({ sub: id, role: 'authenticated' })]);
  const create = (id: string, owner = fixtureUser) => db.exec(`select create_copy_trade('${id}','${owner}','schema-trader','Forged',100,999,999,999,now(),now(),1)`);
  const balance = async (id = fixtureUser) => Number((await db.query<{balance:number}>('select balance from users where id=$1',[id])).rows[0].balance);
  await db.exec("update traders set max_followers=1 where id='schema-trader'");
  await asUser(fixtureUser); await create('first');
  await assert.rejects(create('duplicate'), /unsettled allocation/); assert.equal(await balance(),900);
  assert.equal(Number((await db.query<{roi_percent:number}>('select roi_percent from copy_trades where id=\'first\'')).rows[0].roi_percent),10);
  await asUser(other); await assert.rejects(create('full',other), /allocation limit/); assert.equal(await balance(other),1000);
  await assert.rejects(db.exec("select cancel_copy_trade('first')"), /own copy trade/);
  await asUser(fixtureUser); await db.exec("select cancel_copy_trade('first')");
  await assert.rejects(db.exec("select cancel_copy_trade('first')"), /not currently running/); assert.equal(await balance(),1000);
  await asUser(other); await create('second',other); assert.equal(await balance(other),900);
  await db.exec("update copy_trades set end_timestamp=now()-interval '1 minute' where id='second'");
  await assert.rejects(db.exec("select cancel_copy_trade('second')"), /matured/); assert.equal(await balance(other),900);
  await db.exec("select claim_copy_trade_payout('second'); select claim_copy_trade_payout('second')"); assert.equal(await balance(other),1010);
  await asUser(fixtureUser);
  await db.exec("update traders set roi='NaN' where id='schema-trader'");
  await assert.rejects(create('invalid'), /invalid allocation terms/); assert.equal(await balance(),1000);
  await db.exec("update traders set roi=10,active=false where id='schema-trader'");
  await assert.rejects(create('disabled'), /not accepting/);
 } finally { await db.close(); }
});
