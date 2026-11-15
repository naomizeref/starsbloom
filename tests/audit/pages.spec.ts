import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
const groups={guest:['/','/about','/contact','/markets','/plans','/copy-trading','/auth','/login','/register','/terms','/privacy','/risk','/parents','/parenting'],user:['/dashboard','/dashboard/trading','/dashboard/portfolio','/dashboard/plans','/dashboard/wallet','/dashboard/wallet?tab=withdraw','/dashboard/wallet?tab=ledger','/dashboard/support','/dashboard/transactions','/dashboard/airdrops','/dashboard/kyc','/dashboard/wallet-feedback','/dashboard/notifications','/dashboard/settings','/copy-trading']};
for(const width of [375,1440]) for(const [role,routes] of Object.entries(groups)) {
 test(`${role} pages at ${width}px`,async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width,height:900});
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/api/parents-proxy',r=>r.fulfill({contentType:'text/html',body:'<h1>Parents portal fixture</h1>'}));
  const findings:any[]=[];
  for(const route of routes){const errors:string[]=[];const handler=(e:Error)=>errors.push(e.message);page.on('pageerror',handler);
   await page.goto(`/tests/audit/index.html?role=${role}&route=${encodeURIComponent(route)}`);await expect(page.locator('main').first()).toBeVisible();
   if(route==='/') await expect(page.frameLocator('iframe').getByRole('heading').first()).toBeVisible();
   else await expect.poll(async()=>page.locator('main').innerText()).not.toBe('');
   if(route==='/dashboard')await expect(page.getByRole('heading',{name:'Asset Overview'})).toBeVisible();
   await page.waitForTimeout(1000);
   const measurement=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,180),overflow:[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right>innerWidth+2&&getComputedStyle(e).position!=='fixed';}).slice(0,6).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,55)}))}));
   if(route==='/'){const frame=page.frames().find(f=>f.url().includes('landing.html'))!;const inner=await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(inner.scroll>inner.width+2) errors.push(`Homepage iframe overflows: ${inner.scroll}/${inner.width}`);}
   findings.push({route,errors,...measurement});
   await page.screenshot({path:`test-results/audit/${role}-${width}-${route.replace(/[^a-z0-9]/gi,'_')}.png`,fullPage:true});
   page.off('pageerror',handler);
  }
  await fs.writeFile(`test-results/audit/${role}-${width}.json`,JSON.stringify(findings,null,2));
  expect(findings.filter(f=>f.errors.length||f.scroll>width+2),JSON.stringify(findings.filter(f=>f.errors.length||f.scroll>width+2),null,2)).toEqual([]);
 });
}
const adminTabs=['All Users & Balances','Investment Plans','Financial Ledger','Content Editor','Business Settings','Traders List','Free Coin Claims (Airdrops)','Wallet Gateways','ID Verifications','Incoming Payments (Deposits)','Payout Requests (Withdrawals)','Announcements Panel','Ticket Helpdesk','Wallet Feedback','Security & Audit Logs'];
const adminHeadings:Record<string,string>={'All Users & Balances':'User Management','Business Settings':'Settings','Traders List':'Trader Management','Free Coin Claims (Airdrops)':'Airdrop Campaigns','Wallet Gateways':'Deposit Wallet Management','Incoming Payments (Deposits)':'Deposit Management','Payout Requests (Withdrawals)':'Withdrawal Management'};
for(const width of [375,1440])test(`admin pages at ${width}px`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:900});await page.route('https://**/*',r=>r.abort());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/audit/index.html?role=admin&route=/admin');
 await expect(page.getByRole('button',{name:width===375?'Open admin navigation':'All Users & Balances',exact:true})).toBeVisible();
 const findings:any[]=[];
 for(const tab of adminTabs){if(width===375)await page.getByRole('button',{name:'Open admin navigation',exact:true}).click();
  await page.getByRole('button',{name:tab,exact:true}).click();await expect(page.getByRole('heading',{name:adminHeadings[tab]||tab,exact:true})).toBeVisible();await page.waitForTimeout(500);
  const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);findings.push({tab,scroll,errors:[...errors]});errors.length=0;
  await page.screenshot({path:`test-results/audit/admin-${width}-${tab.replace(/[^a-z0-9]/gi,'_')}.png`,fullPage:true});
 }
 await fs.writeFile(`test-results/audit/admin-${width}.json`,JSON.stringify(findings,null,2));
 expect(findings.filter(f=>f.errors.length||f.scroll>width+2),JSON.stringify(findings,null,2)).toEqual([]);
});

test('empty user and admin pages render without crashes on mobile',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:375,height:812});await page.route('https://**/*',r=>r.abort());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of groups.user){
  await page.goto(`/tests/audit/index.html?role=user&data=empty&route=${encodeURIComponent(route)}`);
  await expect.poll(()=>page.locator('main').innerText()).not.toBe('');await page.waitForTimeout(300);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);
 }
 await page.goto('/tests/audit/index.html?role=admin&data=empty&route=/admin');
 for(const tab of adminTabs){await page.getByRole('button',{name:'Open admin navigation',exact:true}).click();await page.getByRole('button',{name:tab,exact:true}).click();await expect(page.getByRole('heading',{name:adminHeadings[tab]||tab,exact:true})).toBeVisible();await page.waitForTimeout(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);}
 expect(errors).toEqual([]);
});
