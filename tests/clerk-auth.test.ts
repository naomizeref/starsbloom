import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifiedClerkAccount } from '../api/_clerkAuth';
import sessionHandler from '../api/clerk-session';
import codesHandler from '../api/auth-codes';
import { parseClerkExport, importClerkUsers } from '../scripts/import-clerk-users.mjs';

const originalFetch=globalThis.fetch, originalEnv={...process.env};
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const issuer='https://clerk.example.invalid', origin='https://bloom.example.invalid';
const legacyId='11111111-1111-4111-8111-111111111111';
const jwk={...publicKey.export({format:'jwk'}),kid:'test-clerk-key',use:'sig',alg:'RS256'};
let verified=true, status='active', mappedId=legacyId, dbCalls:any[]=[];
const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
function token(overrides:any={}) {
  const now=Math.floor(Date.now()/1000);
  const body=[{alg:'RS256',typ:'JWT',kid:jwk.kid},{iss:issuer,sub:'user_example',sid:'sess_example',azp:origin,iat:now,nbf:now-5,exp:now+60,...overrides}]
    .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${body}.${sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url')}`;
}
beforeEach(()=>{
  Object.assign(process.env,{NODE_ENV:'test',AUTH_PROVIDER:'clerk',CLERK_SECRET_KEY:'sk_test_fixture',CLERK_JWT_ISSUER:issuer,
    CLERK_AUTHORIZED_PARTIES:origin,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',VITE_SUPABASE_ANON_KEY:'fixture-public'});
  verified=true;status='active';mappedId=legacyId;dbCalls=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request ? input.url : input);
    if(url.hostname==='api.clerk.com') {
      if(url.pathname==='/v1/jwks') return json({keys:[jwk]});
      if(url.pathname==='/v1/users/user_example') return json({object:'user',id:'user_example',external_id:legacyId,first_name:'Test',email_addresses:[{id:'email_1',linked_to:[],email_address:'test@example.invalid',verification:{status:verified?'verified':'unverified'}}],primary_email_address_id:'email_1',phone_numbers:[],web3_wallets:[],external_accounts:[],organization_memberships:[]});
      if(url.pathname==='/v1/sessions/sess_example') return json({object:'session',id:'sess_example',user_id:'user_example',status});
    }
    if(url.hostname==='fixture.supabase.co' && url.pathname==='/rest/v1/rpc/bloom_provision_clerk_user') {
      dbCalls.push(JSON.parse(String(init?.body)));
      return json({id:legacyId,email:'test@example.invalid',name:'Test'});
    }
    if(url.hostname==='fixture.supabase.co' && url.pathname==='/rest/v1/rpc/bloom_current_user_id') {
      assert.match(new Headers(init?.headers).get('authorization') || '',/^Bearer ey/,'Uses the Clerk token, not the service role');
      return json(mappedId);
    }
    throw new Error(`Unexpected test request: ${url.hostname}${url.pathname}`);
  };
});
afterEach(()=>{globalThis.fetch=originalFetch;process.env={...originalEnv};});
async function call(handler:any,bearer?:string) {
  let statusCode=0,body:any;
  await handler({method:'POST',headers:bearer?{authorization:`Bearer ${bearer}`}:{},body:{legacyId:'forged',email:'forged@example.invalid'}},
    {setHeader(){},status(code:number){statusCode=code;return this;},json(value:any){body=value;}});
  return {statusCode,body};
}
test('server verifies Clerk token and provisions the server-owned external ID, ignoring request body',async()=>{
  const result=await call(sessionHandler,token());
  assert.equal(result.statusCode,200,JSON.stringify(result.body));
  assert.equal(result.body.user.id,legacyId);
  assert.equal(dbCalls[0].p_legacy_id,legacyId);
  assert.equal(dbCalls[0].p_email,'test@example.invalid');
});
test('invalid signature, expired session, wrong issuer/origin, and pending sessions cannot provision',async()=>{
  const good=token();
  for(const bad of [good.slice(0,-12)+'aaaaaaaaaaaa',token({exp:1}),token({iss:'https://evil.invalid'}),token({azp:'https://evil.invalid'}),token({azp:null}),token({sts:'pending'})]) {
    const result=await call(sessionHandler,bad);
    assert.equal(result.statusCode,401,JSON.stringify(result));
  }
  assert.equal(dbCalls.length,0);
});
test('revoked sessions and unverified email cannot open a financial account',async()=>{
  status='revoked';await assert.rejects(verifiedClerkAccount(token()),/sign in again/);
  status='active';verified=false;await assert.rejects(verifiedClerkAccount(token()),/Verify your email/);
  assert.equal(dbCalls.length,0);
});
test('Clerk cutover disables custom legacy password reset and requires authorization',async()=>{
  assert.equal((await call(codesHandler)).statusCode,410);
  assert.equal((await call(sessionHandler)).statusCode,401);
  process.env.AUTH_PROVIDER='supabase';
  assert.equal((await call(sessionHandler,token())).statusCode,503);
});
test('a missing or mismatched database identity prevents opening the dashboard',async()=>{
  mappedId='different-account';
  const result=await call(sessionHandler,token());
  assert.equal(result.statusCode,503);
  assert.equal(result.body.user,undefined);
});
const exported={id:legacyId,email:'Test@example.invalid',emailVerified:true,authEmailMatches:true,banned:false,passwordDigest:'$2a$10$'+'a'.repeat(53)};
test('import validates every account and refuses unverified, mismatched or duplicate exports',()=>{
  const rows=parseClerkExport(JSON.stringify([{clerk_users:JSON.stringify([exported])}]));
  assert.equal(rows[0].externalId,legacyId);
  assert.equal(rows[0].passwordHasher,'bcrypt');
  for(const change of [{emailVerified:false},{authEmailMatches:false},{banned:true},{passwordDigest:''}]) {
    assert.throws(()=>parseClerkExport(JSON.stringify([{...exported,...change}])),/needs review/);
  }
  assert.throws(()=>parseClerkExport(JSON.stringify([exported,exported])),/Duplicate/);
});
test('import detects existing email collision before any account write; reruns reuse mapped users',async()=>{
  const rows=parseClerkExport(JSON.stringify([exported]));let creates=0,links=0;
  const user={id:'user_existing',externalId:legacyId,primaryEmailAddressId:'email_1',emailAddresses:[{id:'email_1',emailAddress:exported.email,verification:{status:'verified'}}]};
  const clerk:any={users:{getUserList:async()=>({data:[user],totalCount:1}),createUser:async()=>{creates++;return user;}}};
  const db:any={rpc:async()=>{links++;return {error:null};}};
  assert.deepEqual(await importClerkUsers(rows,clerk,db,issuer),{created:0,linked:1});
  clerk.users.getUserList=async(args:any)=>args.emailAddress?{data:[user],totalCount:1}:{data:[],totalCount:0};
  await assert.rejects(importClerkUsers(rows,clerk,db,issuer),/Destination conflict/);
  assert.equal(creates,0);assert.equal(links,1);
});
