import assert from 'node:assert/strict';
export const fixtureUser='11111111-1111-4111-8111-111111111111';
const other='33333333-3333-4333-8333-333333333333';
const admin='22222222-2222-4222-8222-222222222222';
export async function seedExportScenarios(db) {
 await db.exec(`insert into users(id,email,name,balance,role) values
 ('${fixtureUser}','schema-user@example.invalid','Schema user',1000,'user'),
 ('${other}','schema-other@example.invalid','Other user',1000,'user'),
 ('${admin}','schema-admin@example.invalid','Schema admin',0,'admin');
 insert into investment_plans(id,name,min_deposit,max_deposit,duration_days,roi_percent) values('schema-plan','Schema plan',1,10000,30,10);
 insert into traders(id,name,min_copy_amount,max_copy_amount,roi,profit_days) values('schema-trader','Schema trader',1,10000,10,30);
 insert into kyc_submissions(id,user_id,document_type,status) values('schema-kyc','${fixtureUser}','Passport','approved');
 insert into market_prices(symbol,price,updated_at) values('BTC/USD',100,now());
 insert into notifications(id,user_id,recipient_email,title,message) values('other-notice','${other}','schema-other@example.invalid','Private notice','Synthetic test only');
 insert into portfolio_positions(user_id,symbol,name,amount,avg_buy_price,asset_type) values('${other}','LEGACY','Legacy holding',3,25,'stock');
 insert into portfolio_assets(id,user_id,symbol,name,amount,avg_buy_price,type) values('existing-holding','${other}','MODERN','Modern holding',2,50,'stock');
 insert into active_investments(id,user_id,plan_id,plan_name,name,amount,end_date,roi_percent,expected_profit,total_return) values('existing-investment','${other}','schema-plan','Existing terms','Existing terms',200,now()+interval '10 days',20,40,240);
 insert into transactions(id,user_id,type,amount,currency,status) values('existing-ledger','${other}','deposit',500,'USD','completed');
 insert into airdrops(id,title,token,reward_amount) values('schema-airdrop','Schema campaign','USD','10');
 insert into airdrop_claims(id,user_id,airdrop_id,token,reward_amount,status) values('paid-claim','${fixtureUser}','schema-airdrop','USD','10','Approved');`);
}
export async function runExportScenarios(db, stage, identityClaims = id => ({sub:id})) {
 const results=[];
 async function asUser(id=fixtureUser, extra={}) {
  await db.exec('reset role');
  await db.query("select set_config('test.jwt',$1,true)",[JSON.stringify({...identityClaims(id),role:'authenticated',...extra})]);
  await db.exec('set local role authenticated');
 }
 const balance=async()=>Number((await db.query(`select balance from users where id='${fixtureUser}'`)).rows[0].balance);
 async function check(name,fn) {
  await db.exec('begin');
  try {await asUser();await fn();results.push({name,passed:true});}
  catch(e){results.push({name,passed:false,reason:e.message.split('\n')[0].slice(0,180)});}
  finally{await db.exec('rollback');}
 }
 await check('untrusted metadata cannot grant admin',async()=>{await asUser(fixtureUser,{user_metadata:{role:'admin'}});assert.equal((await db.query('select is_admin() as value')).rows[0].value,false);});
 await check('direct balance edits are blocked',async()=>{let blocked=false;try{await db.exec(`update users set balance=9000 where id='${fixtureUser}'`);}catch{blocked=true;}assert.equal(blocked,true);});
 await check('notifications from another account are private',async()=>{assert.equal((await db.query("select id from notifications where id='other-notice'")).rows.length,0);});
 await check('another account notification cannot be deleted',async()=>{assert.equal((await db.query("delete from notifications where id='other-notice' returning id")).rows.length,0);});
 await check('notification writes cannot target another regular account',async()=>{let blocked=false;try{await db.exec(`insert into notifications(id,recipient_email,title,message) values('forged-notice','schema-other@example.invalid','Test','Synthetic only')`);}catch{blocked=true;}assert.equal(blocked,true);});
 await check('self notifications and admin requests still work',async()=>{await db.exec(`insert into notifications(id,recipient_email,title,message) values('own-notice','schema-user@example.invalid','Test','Synthetic only');insert into notifications(id,recipient_email,audience,title,message) values('admin-request','schema-admin@example.invalid','admin','Test','Synthetic only');update notifications set read=true where id='own-notice';`);assert.equal((await db.query("select read from notifications where id='own-notice'")).rows[0].read,true);});
 await check('reviewed airdrop claim cannot be reopened by its owner',async()=>{let blocked=false;try{blocked=(await db.query("update airdrop_claims set status='Pending' where id='paid-claim' returning id")).rows.length===0;}catch{blocked=true;}assert.equal(blocked,true);});
 await check('new airdrop claims use campaign rewards and cannot be duplicated',async()=>{
  await asUser(other);await db.exec(`insert into airdrop_claims(id,user_id,airdrop_id,token,reward_amount,status) values('new-claim','${other}','schema-airdrop','FORGED','9999','Pending')`);
  assert.equal((await db.query("select reward_amount from airdrop_claims where id='new-claim'")).rows[0].reward_amount,'10');
  await asUser(admin);await db.exec("select approve_airdrop_claim('new-claim')");
  assert.equal(Number((await db.query(`select balance from users where id='${other}'`)).rows[0].balance),1010);
  await asUser(other);let blocked=false;try{await db.exec(`insert into airdrop_claims(id,user_id,airdrop_id,token,reward_amount,status) values('repeat-claim','${other}','schema-airdrop','USD','10','Pending')`);}catch{blocked=true;}assert.equal(blocked,true);
 });
 await check('current investment topup maturity and duplicate payout',async()=>{
  await db.exec(`select create_investment('schema-position','${fixtureUser}','schema-plan','Ignored',100,999,999,999,999,now(),now(),1)`);
  assert.equal(await balance(),900);
  await db.exec("select top_up_investment('schema-position',25)");assert.equal(await balance(),875);
  await db.exec('reset role');await db.exec("update active_investments set end_date=now()-interval '1 day' where id='schema-position'");await asUser();
  await db.exec("select claim_investment_payout('schema-position');select claim_investment_payout('schema-position')");assert.equal(await balance(),1012.5);
 });
 await check('current copy trade and cancellation preserve balance',async()=>{
  await db.exec(`select create_copy_trade('schema-copy','${fixtureUser}','schema-trader','Ignored',100,999,999,999,now(),now(),0)`);
  assert.equal(await balance(),900);await db.exec("select cancel_copy_trade('schema-copy')");assert.equal(await balance(),1000);
 });
 await check('current buy and sell use trusted quotes',async()=>{
  await db.exec(`select buy_asset('${fixtureUser}','BTC/USD','Bitcoin',100,1,999,'crypto')`);
  assert.equal(await balance(),900);assert.equal(Number((await db.query("select amount from portfolio_assets where symbol='BTC/USD'")).rows[0].amount),1);
  await db.exec(`select sell_asset('${fixtureUser}','BTC/USD',999,1,1)`);assert.equal(await balance(),1000);
 });
 await check('withdrawal rejection refunds exactly once',async()=>{
  await db.exec(`select create_withdrawal_transaction('schema-withdrawal','${fixtureUser}',10,'USD','USD')`);assert.equal(await balance(),990);
  await asUser(admin);await db.exec("select reject_withdrawal_transaction('schema-withdrawal');select reject_withdrawal_transaction('schema-withdrawal')");
  await asUser();assert.equal(await balance(),1000);
 });
 await check('support reply reaches saved messages',async()=>{
  await db.exec(`insert into support_tickets(id,user_id,subject,messages) values('schema-ticket','${fixtureUser}','Test','[]');select reply_to_ticket('schema-ticket','Synthetic test','Now')`);
  assert.equal((await db.query("select messages from support_tickets where id='schema-ticket'")).rows[0].messages.length,1);
 });
 await check('legacy investment ignores caller-supplied yield',async()=>{
  await db.exec(`select create_investment('legacy-schema-position','${fixtureUser}','schema-plan','Ignored',100,1,900)`);
  assert.equal(Number((await db.query("select roi_percent from active_investments where id='legacy-schema-position'")).rows[0].roi_percent),10);
 });
 await check('legacy copy ignores caller-supplied yield',async()=>{
  await db.exec(`select create_copy_trade('legacy-schema-copy','${fixtureUser}','schema-trader','Ignored',100,1,900)`);
  assert.equal(Number((await db.query("select roi_percent from copy_trades where id='legacy-schema-copy'")).rows[0].roi_percent),10);
 });
 await check('legacy sell uses trusted quotes and preserves the legacy table',async()=>{await db.exec(`select buy_asset('${fixtureUser}','BTC/USD','Bitcoin',1,1,'crypto');select sell_asset('${fixtureUser}','BTC/USD',1,999)`);assert.equal(await balance(),1000);assert.equal((await db.query(`select * from portfolio_assets where user_id='${fixtureUser}'`)).rows.length,0);});
 await check('legacy buy ignores caller-supplied execution price',async()=>{
  await db.exec(`select buy_asset('${fixtureUser}','BTC/USD','Bitcoin',1,1,'crypto')`);assert.equal(await balance(),900);
 });
 return {stage,results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length};
}

export const financialSnapshot=async(db)=>(await db.query(`select jsonb_build_object(
  'users',(select jsonb_agg(to_jsonb(u) order by id) from users u),
  'ledger',(select jsonb_agg(to_jsonb(t)-array['payment_method','gift_card_details','gift_card_image_paths'] order by id) from transactions t),
  'assets',(select jsonb_agg(to_jsonb(p) order by id) from portfolio_assets p),
  'legacy_holdings',(select jsonb_agg(to_jsonb(p) order by symbol) from portfolio_positions p),
  'investments',(select jsonb_agg(jsonb_build_array(id,user_id,amount,start_date,end_date,roi_percent,expected_profit,total_return,status,payout_completed,payout_transaction_id) order by id) from active_investments)
 ) as data`)).rows[0].data;
