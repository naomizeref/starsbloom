import { test, expect } from '@playwright/test';
async function open(page:any,role:string,route:string){await page.route('https://**/*',(r:any)=>r.abort());await page.goto(`/tests/audit/index.html?role=${role}&route=${encodeURIComponent(route)}`);}
async function fail(page:any,value=true){await page.evaluate((v:boolean)=>{(window as any).__audit.controls.fail=v;},value);}
async function adminTab(page:any,name:string){await page.getByRole('button',{name,exact:true}).click();}
test('support failures preserve drafts and success clears them',async({page})=>{
 await open(page,'user','/dashboard/support');
 await page.getByLabel('Subject',{exact:true}).fill('Deposit help');
 await page.getByLabel('Support message').fill('Please check my transfer.');await fail(page);
 await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Unable to submit your ticket');
 await expect(page.getByLabel('Support message')).toHaveValue('Please check my transfer.');
 await fail(page,false);await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.getByLabel('Support message')).toHaveValue('');
 await page.getByLabel('Reply message').fill('Here are more details.');await fail(page);
 await page.getByRole('button',{name:'Send reply'}).click();
 await expect(page.getByLabel('Reply message')).toHaveValue('Here are more details.');
 await expect(page.getByRole('alert')).toContainText('Unable to send');
});
test('admin ticket and withdrawal failures never report success',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await open(page,'admin','/admin');await adminTab(page,'Ticket Helpdesk');
 await page.getByRole('button').filter({hasText:'Deposit question'}).click();
 await page.getByLabel('Reply message').fill('We need more information.');await fail(page);
 await page.getByRole('button',{name:'Send reply'}).click();await expect(page.getByRole('alert')).toContainText('Simulated save failure');
 await expect(page.getByLabel('Reply message')).toHaveValue('We need more information.');
 await page.getByRole('button',{name:'Mark Resolved'}).click();await expect(page.getByRole('alert')).toContainText('Simulated save failure');
 await adminTab(page,'Payout Requests (Withdrawals)');await page.getByRole('button',{name:'Approve',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Simulated save failure');
 await expect(page.getByText('Approved withdrawal tx-2')).toHaveCount(0);
 await fail(page,false);await page.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByRole('status')).toContainText('Approved withdrawal tx-2');
 expect(errors).toEqual([]);
});
test('settings retain unsaved changes and password failures stay visible',async({page})=>{
 await open(page,'admin','/admin');await adminTab(page,'Business Settings');
 await page.getByLabel('Company Name',{exact:true}).fill('Unsaved name');await fail(page);
 await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
 await expect(page.getByText('Settings could not be saved. Please try again.')).toBeVisible();
 await expect(page.getByLabel('Company Name',{exact:true})).toHaveValue('Unsaved name');
 await open(page,'user','/dashboard/settings');await expect(page.getByRole('heading',{name:'Account settings'})).toBeVisible();
 await page.getByLabel('New password',{exact:true}).fill('test-only-password');await page.getByLabel('Confirm new password').fill('test-only-password');await fail(page);
 await page.getByRole('button',{name:'Update password'}).click();await expect(page.getByRole('alert')).toContainText('Simulated save failure');
 await fail(page,false);await page.getByRole('button',{name:'Update password'}).click();await expect(page.getByRole('status')).toContainText('Your password has been updated.');
});
test('guards redirect guests and keep users out of admin',async({page})=>{
 await open(page,'guest','/dashboard');await expect(page).toHaveURL(/\/auth$/);
 await open(page,'user','/admin');await expect(page).toHaveURL(/\/dashboard$/);
 await expect(page.getByRole('heading',{name:'Asset Overview'})).toBeVisible();
});

test('real settings hook rejects missing tables without changing local state',async({page})=>{
 await page.goto('/tests/audit/index.html?mode=settings');
 await expect(page.getByText('Settings persistence fixture')).toBeVisible();
 const result=await page.evaluate(async()=>{const s=(window as any).__settings;const before=JSON.stringify({settings:s.appSettings,content:s.siteContent,cache:localStorage.getItem('bloom_app_settings')});let failures=0;try{await s.updateAppSettings({companyName:'Must not be saved'});}catch{failures++;}try{await s.updateSiteContent({hero_title:'Must not be saved'});}catch{failures++;}return{before,failures};});
 expect(result.failures).toBe(2);
 expect(await page.evaluate(()=>{const s=(window as any).__settings;return JSON.stringify({settings:s.appSettings,content:s.siteContent,cache:localStorage.getItem('bloom_app_settings')});})).toBe(result.before);
 await page.evaluate(async()=>{const s=(window as any).__settings;s.control.fail=false;await s.updateAppSettings({companyName:'Confirmed company'});});
 await expect.poll(()=>page.evaluate(()=>(window as any).__settings.appSettings.companyName)).toBe('Confirmed company');
});

test('wallet requests never solicit secrets and failed requests keep their text',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await open(page,'user','/dashboard/wallet-feedback');
 await expect(page.getByRole('heading',{name:'Wallet integration requests'})).toBeVisible();
 await expect(page.getByText('Submitting a request does not connect your wallet or grant access to funds.')).toBeVisible();
 await page.getByLabel('What would you use this wallet integration for?').fill('I want to view my public balance.');await fail(page);
 await page.getByRole('button',{name:'Submit request'}).click();
 await expect(page.getByLabel('What would you use this wallet integration for?')).toHaveValue('I want to view my public balance.');
 await expect(page.getByText('Unable to submit your wallet request. Please try again.')).toBeVisible();
 await fail(page,false);await page.getByRole('button',{name:'Submit request'}).click();
 await expect(page.getByLabel('What would you use this wallet integration for?')).toHaveValue('');
});

test('homepage and mobile menu links reach their intended pages',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await open(page,'guest','/');
 const home=page.frameLocator('iframe');
 await expect(home.getByRole('heading').first()).toBeVisible();
 await home.locator('a[href="/register"]').first().click();
 await expect(page).toHaveURL(/\/register$/);
 await open(page,'guest','/#contact');await expect(page).toHaveURL(/\/contact$/);
 await expect(page.getByRole('heading',{name:'Contact Us'})).toBeVisible();
 await open(page,'user','/dashboard');
 await page.getByRole('button',{name:'Toggle navigation menu'}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/settings$/);
 await expect(page.getByRole('heading',{name:'Account settings'})).toBeVisible();
});
