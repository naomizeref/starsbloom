import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildFeatureMigration } from '../scripts/feature-migrations.mjs';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const sql = (name: string) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const user = '11111111-1111-4111-8111-111111111111';
const admin = '22222222-2222-4222-8222-222222222222';

test('Bloom legacy schema upgrades support private KYC, deposits, role protection and paused positions', async () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to authenticated, anon;
    `);
    await db.exec(await sql('supabase_schema.sql'));
    await db.exec(await sql('missing_tables_master_migration.sql'));
    const upgrade = await buildFeatureMigration();
    await db.exec(upgrade);
    await db.exec(upgrade); // The exact generated release bundle is repeatable.
    await db.exec(`grant select,insert,update,delete on all tables in schema public, storage to authenticated;
      insert into users(id,email,name,balance,role) values ('${user}','test@example.com','Test',1000,'user'),('${admin}','admin@example.com','Admin',0,'admin');
      insert into investment_plans(id,name,min_deposit,max_deposit,roi_percent,duration_days,enabled,status) values ('test-plan','Test plan',1,10000,10,30,true,'active');`);
    const asUser = async (id: string, extra: object = {}) => {
      await db.exec('reset role');
      await db.query("select set_config('test.jwt',$1,false)", [JSON.stringify({sub:id,...extra})]);
      await db.exec('set role authenticated');
    };
    await asUser(user, { user_metadata: { role: 'admin' }, email: 'henrikaram1@gmail.com' });
    assert.equal((await db.query<any>('select is_admin() as admin')).rows[0].admin, false);
    for (const change of ["role='admin'","status='active',balance=9000","points=9999","email='admin@example.com'"]) {
      await assert.rejects(db.exec(`update users set ${change} where id='${user}'`), /managed by the platform/);
    }
    await db.exec(`update users set name='Updated name' where id='${user}'`);
    await assert.rejects(db.exec(`insert into transactions(id,user_id,type,amount,currency,status) values ('forged','${user}','deposit',50,'USD','completed')`), /pending deposits/);
    await assert.rejects(db.exec(`select create_withdrawal_transaction('unverified','${user}',10,'USD','USD')`), /Verification Required/);
    assert.equal(Number((await db.query<any>(`select balance from users where id='${user}'`)).rows[0].balance),1000);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('kyc-documents','${user}/abc.png'),('kyc-documents','${user}/def.png');
      insert into kyc_submissions(user_id,document_type,id_type,id_number,dob,address,city,country,front_image,back_image)
      values ('${user}','Government ID','Government ID','TEST-1','1990-01-01','Test street','Lagos','Nigeria','${user}/abc.png','${user}/def.png');`);
    const row = (await db.query<any>(`select * from kyc_submissions where user_id='${user}'`)).rows[0];
    assert.ok(row.id); assert.equal(row.revision,1);
    await asUser(admin);
    await db.exec(`select review_kyc_submission('${user}','approved','Verified',1)`);
    await asUser(user);
    await db.exec(`select create_withdrawal_transaction('valid-withdrawal','${user}',10,'USD','USD')`);
    await assert.rejects(db.exec(`select create_withdrawal_transaction('negative','${user}',-10,'USD','USD')`), /positive/);
    await db.exec(`insert into storage.objects(bucket_id,name) values ('gift-card-proofs','${user}/card.png');
      insert into transactions(id,user_id,type,amount,currency,status,payment_method,gift_card_details,gift_card_image_paths)
      values ('gift','${user}','deposit',50,'USD','pending','gift_card','{"brand":"Amazon","faceValue":50,"currency":"USD"}',array['${user}/card.png']);`);
    await asUser(admin);
    await db.exec("select approve_deposit_transaction('gift'); select approve_deposit_transaction('gift');");
    await asUser(user);
    assert.equal(Number((await db.query<any>(`select balance from users where id='${user}'`)).rows[0].balance),1040);
    await db.exec(`select create_investment('position','${user}','test-plan','Ignored',100,999,999,999,999,now(),now(),1)`);
    await asUser(admin);
    await db.exec(`update users set status='suspended' where id='${user}'`);
    await asUser(user);
    await assert.rejects(db.exec(`update users set status='active' where id='${user}'`),/managed by the platform/);
    await assert.rejects(db.exec("select claim_investment_payout('position')"), /suspended or restricted/);
    assert.ok((await db.query<any>("select paused_at from active_investments where id='position'")).rows[0].paused_at);
    await asUser(admin);
    await db.exec(`update users set status='active' where id='${user}'`);
    assert.equal((await db.query<any>("select paused_at from active_investments where id='position'")).rows[0].paused_at,null);
    await asUser(user);
    await assert.rejects(db.exec("select claim_investment_payout('position')"),/not matured/);
    // Financial actions operate against the real legacy schema, not stub RPCs.
    const balance = async () => Number((await db.query<any>(`select balance from users where id='${user}'`)).rows[0].balance);
    assert.equal(await balance(), 940);
    for (const amount of ["-1", "0", "0.001", "'NaN'::numeric", "'Infinity'::numeric"]) {
      await assert.rejects(db.exec(`select top_up_investment('position',${amount})`), /Invalid top-up amount/);
      assert.equal(await balance(), 940);
    }
    await db.exec("select top_up_investment('position',25)");
    assert.equal(await balance(), 915);
    const topped = (await db.query<any>("select * from active_investments where id='position'")).rows[0];
    assert.equal(Number(topped.amount),125);
    assert.equal(Number(topped.total_return),137.5);
    assert.equal(topped.name,'Test plan');
    await asUser(admin);
    await assert.rejects(db.exec("delete from investment_plans where id='test-plan'"), /Disable the plan/);
    await db.exec('reset role');
    await db.exec("update active_investments set end_date=now()-interval '1 second' where id='position'");
    await asUser(user);
    await assert.rejects(db.exec("select top_up_investment('position',1)"), /cannot be topped up/);
    await db.exec("select claim_investment_payout('position'); select claim_investment_payout('position');");
    assert.equal(await balance(),1052.5);
    assert.equal(Number((await db.query<any>("select count(*) as n from transactions where type='payout' and related_reference_id='position'")).rows[0].n),1);
    await db.exec('reset role');
    await db.exec("insert into traders(id,name,min_copy_amount,max_copy_amount,roi,profit_days,active) values('test-trader','Test trader',1,0,10,30,true)");
    await asUser(user);
    await db.exec(`select create_copy_trade('copy-position','${user}','test-trader','Ignored',100,999,999,999,now(),now(),0)`);
    assert.equal(await balance(),952.5);
    await assert.rejects(db.exec("select claim_copy_trade_payout('copy-position')"), /not matured/);
    await asUser(admin);
    await assert.rejects(db.exec("delete from traders where id='test-trader'"), /Disable the trader/);
    await db.exec('reset role');
    await db.exec("update copy_trades set end_timestamp=now()-interval '1 second' where id='copy-position'");
    await asUser(user);
    await db.exec("select claim_copy_trade_payout('copy-position'); select claim_copy_trade_payout('copy-position');");
    assert.equal(await balance(),1062.5);
    await db.exec(`select create_copy_trade('cancel-position','${user}','test-trader','Ignored',100,999,999,999,now(),now(),0)`);
    await db.exec("select cancel_copy_trade('cancel-position')");
    await assert.rejects(db.exec("select cancel_copy_trade('cancel-position')"), /not currently running/);
    await db.exec("select claim_copy_trade_payout('cancel-position')"); // refunded already; never credits again
    assert.equal(await balance(),1062.5);
    // Ambiguous legacy completed rows require reconciliation, never an inferred credit.
    await db.exec(`select create_investment('ambiguous','${user}','test-plan','Ignored',100,999,999,999,999,now(),now(),1)`);
    await db.exec('reset role');
    await db.exec("update active_investments set status='Completed',end_date=now()-interval '1 second' where id='ambiguous'");
    await asUser(user);
    await assert.rejects(db.exec("select claim_investment_payout('ambiguous')"), /reconciliation/);
    assert.equal(await balance(),962.5);
    await db.exec('reset role');
    const snapshot = async () => (await db.query<any>("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from users u),'investments',(select jsonb_agg(to_jsonb(i) order by id) from active_investments i),'copies',(select jsonb_agg(to_jsonb(c) order by id) from copy_trades c),'transactions',(select jsonb_agg(to_jsonb(t) order by id) from transactions t)) as snapshot")).rows[0].snapshot;
    const before = await snapshot();
    await db.exec(upgrade);
    assert.deepEqual(await snapshot(),before,'reapplying the upgrade preserves balances, terms, paid history and legacy rows');
    const exported = await db.exec(await sql('scripts/export-schema.sql'));
    assert.ok(exported[0].rows.length,'read-only schema export runs on the historical schema');
  } finally { await db.close(); }
});
