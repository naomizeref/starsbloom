import {test,expect} from '@playwright/test';
const ids={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222'};
const identity=(id:string)=>({id,email:'test@example.invalid',user_metadata:{name:'Test'}});
test.beforeEach(async({page})=>{
 await page.route('https://fixture.supabase.co/**',route=>{
  const id=new URL(route.request().url()).searchParams.get('id')?.slice(3);
  return route.fulfill({json:{...identity(id!),role:id===ids.A?'admin':'user',status:'active',balance:100}});
 });
});
test('Clerk token accesses the mapped Bloom profile and email API; logout clears identity',async({page})=>{
 let dbToken='',emailToken='';
 page.on('request',r=>{if(r.url().includes('fixture.supabase.co'))dbToken=r.headers()['authorization'];});
 await page.route('**/api/clerk-session',r=>r.fulfill({json:{user:identity(ids.A)}}));
 await page.route('**/api/send-email',r=>{emailToken=r.request().headers()['authorization'];return r.fulfill({json:{success:true}});});
 await page.goto('/tests/clerk/index.html');
 await page.evaluate(()=>(window as any).__clerk.signIn('A'));
 await expect(page.getByLabel('Identity')).toContainText(`"profile":"${ids.A}"`);
 await expect(page.getByLabel('Identity')).toContainText('"admin":true');
 expect(dbToken).toBe('Bearer token-A');
 await page.getByRole('button',{name:'Email',exact:true}).click();
 await expect.poll(()=>emailToken).toBe('Bearer token-A');
 await page.getByRole('button',{name:'Log out'}).click();
 await expect(page.getByLabel('Identity')).toHaveText('{"admin":false,"ready":true}');
});
test('slow previous account cannot restore its profile after switching sessions',async({page})=>{
 await page.route('**/api/clerk-session',async r=>{
  const isA=r.request().headers()['authorization']==='Bearer token-A';
  if(isA)await new Promise(resolve=>setTimeout(resolve,500));
  await r.fulfill({json:{user:identity(isA?ids.A:ids.B)}}).catch(()=>{});
 });
 await page.goto('/tests/clerk/index.html');
 await page.evaluate(()=>(window as any).__clerk.signIn('A'));
 await expect(page.getByRole('status')).toHaveText('Opening Bloom…');
 await page.evaluate(()=>(window as any).__clerk.signIn('B'));
 await expect(page.getByLabel('Identity')).toContainText(ids.B);
 await page.waitForTimeout(700);
 await expect(page.getByLabel('Identity')).not.toContainText(ids.A);
 await expect(page.getByLabel('Identity')).toContainText('"admin":false');
});
test('failed account linking blocks the app with a retry and sign-out path',async({page})=>{
 let fail=true;
 await page.route('**/api/clerk-session',r=>r.fulfill(fail?{status:409,json:{error:'Your account needs to be linked.'}}:{json:{user:identity(ids.B)}}));
 await page.goto('/tests/clerk/index.html');
 await page.evaluate(()=>(window as any).__clerk.signIn('B'));
 await expect(page.getByRole('alert')).toHaveText('Your account needs to be linked.');
 await expect(page.getByLabel('Identity')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 fail=false;await page.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByLabel('Identity')).toContainText(ids.B);
});

test('pending Clerk security tasks do not provision or expose the dashboard',async({page})=>{
 let provisioning=0;
 await page.route('**/api/clerk-session',r=>{provisioning++;return r.fulfill({json:{user:identity(ids.A)}});});
 await page.goto('/tests/clerk/index.html');
 await page.evaluate(()=>(window as any).__clerk.signIn('A',{key:'setup-mfa'}));
 await expect(page.getByText('Complete required account task')).toBeVisible();
 await expect(page.getByLabel('Identity')).toHaveCount(0);
 expect(provisioning).toBe(0);
});

test('token acquisition timeout blocks access and offers retry',async({page})=>{
 await page.clock.install();
 let provisioning=0;
 await page.route('**/api/clerk-session',r=>{provisioning++;return r.fulfill({json:{user:identity(ids.A)}});});
 await page.goto('/tests/clerk/index.html');
 await page.evaluate(()=>{(window as any).__clerkTokenStalled=true;(window as any).__clerk.signIn('A');});
 await expect(page.getByRole('status')).toHaveText('Opening Bloom…');
 await page.clock.fastForward(21000);
 await expect(page.getByRole('alert')).toContainText('Opening your account took too long');
 expect(provisioning).toBe(0);
 await expect(page.getByLabel('Identity')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).__clerkTokenStalled=false;});
 await page.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByLabel('Identity')).toContainText(ids.A);
});
