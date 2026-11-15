import { test, expect } from '@playwright/test';
for (const width of [375,1440]) {
 test(`copy allocation review, errors and pending controls at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900}); await page.route('https://**/*',r=>r.abort());
  const crashes:string[]=[]; page.on('pageerror',e=>crashes.push(e.message));
  await page.goto('/tests/audit/index.html?role=user&route=/copy-trading');
  await page.evaluate(()=>{const f=(window as any).__audit;f.state.traders.push({...f.state.traders[0],id:'disabled',name:'Hidden trader',active:false});f.emit();});
  await expect(page.getByText('Hidden trader')).toHaveCount(0);
  await page.getByLabel('Search traders').fill('missing'); await expect(page.getByText('No traders match your search.')).toBeVisible();
  await page.getByLabel('Search traders').fill('');
  await page.getByRole('button',{name:'Review Test Trader',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Allocation amount (USD)')).toBeFocused();
  await dialog.getByLabel('Allocation amount (USD)').fill('10.001'); await dialog.getByRole('button',{name:'Confirm allocation',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('two decimal places');
  await page.evaluate(()=>{const f=(window as any).__audit;f.state.copyTrader=async()=>{throw new Error('Network unavailable');};f.emit();});
  await dialog.getByLabel('Allocation amount (USD)').fill('20.50'); await dialog.getByRole('button',{name:'Confirm allocation',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Check your positions'); await expect(dialog.getByLabel('Allocation amount (USD)')).toHaveValue('20.50');
  await page.evaluate(()=>{(window as any).__audit.state.copyTrader=(...args:any[])=>{(window as any).__copyArgs=args;return new Promise(resolve=>{(window as any).__resolveCopy=resolve;});};(window as any).__audit.emit();});
  await dialog.getByRole('button',{name:'Confirm allocation',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Close allocation'})).toBeDisabled(); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__copyArgs)).toEqual(['trader-1',20.5]);
  await page.evaluate(()=>(window as any).__resolveCopy({success:false,message:'Terms changed. Please review.'}));
  await expect(dialog.getByRole('alert')).toContainText('Terms changed');
  await page.screenshot({path:`test-results/audit/copy-dialog-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Review Test Trader',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Review Test Trader',exact:true}).click();
  // The position refresh can finish before the overall confirmation resolves.
  await page.evaluate(()=>{const f=(window as any).__audit;f.state.copyTrader=()=>{f.state.user.copyTrades.push({id:'new-copy',traderId:'trader-1',traderName:'Test Trader',amountInvested:10,roiPercent:10,expectedProfit:1,totalReturn:11,startTimestamp:new Date().toISOString(),endTimestamp:new Date(Date.now()+86400000).toISOString(),remainingDays:1,progress:0,status:'Running',payoutCompleted:false});f.emit();return new Promise(resolve=>{(window as any).__resolveCopy=resolve;});};f.emit();});
  await page.getByRole('dialog').getByRole('button',{name:'Confirm allocation',exact:true}).click();
  await expect(page.getByRole('button',{name:'View allocation with Test Trader',exact:true,includeHidden:true})).toHaveCount(1);
  await expect(dialog.getByRole('button',{name:'Confirming…'})).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__resolveCopy({success:true,message:'confirmed'}));
  await expect(page.getByRole('status')).toContainText('confirmed');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:`test-results/audit/copy-directory-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2); expect(crashes).toEqual([]);
 });
}

test('copy positions keep failed payouts actionable and cancellation history visible', async ({page})=>{
 await page.route('https://**/*',r=>r.abort());
 await page.goto('/tests/audit/index.html?role=user&route=/copy-trading');
 await page.evaluate(()=>{const f=(window as any).__audit;const base={traderId:'trader-1',traderName:'Test Trader',amountInvested:100,expectedProfit:10,totalReturn:110,roiPercent:10,startTimestamp:new Date(Date.now()-86400000).toISOString(),endTimestamp:new Date(Date.now()-1000).toISOString(),remainingDays:0,progress:100,payoutCompleted:false};f.state.user.copyTrades=[{...base,id:'due',status:'Completed'},{...base,id:'cancelled',status:'Cancelled',payoutCompleted:true}];f.state.claimCopyTradePayout=async()=>({success:false,message:'Payout not confirmed'});f.emit();});
 await page.getByRole('button',{name:'Claim payout $110.00',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Payout not confirmed');
 await expect(page.getByRole('button',{name:'Claim payout $110.00',exact:true})).toBeEnabled();
 await page.getByText('Allocation history (1)').click(); await expect(page.getByText('Cancelled · Principal returned $100.00')).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).__audit;f.state.user.copyTrades[0].status='Running';f.state.user.copyTrades[0].endTimestamp=new Date(Date.now()+86400000).toISOString();f.state.uncopyTrader=async(id:string)=>{(window as any).__cancelId=id;return {success:true,message:'cancelled'};};f.emit();});
 page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'End allocation',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('principal was returned'); expect(await page.evaluate(()=>(window as any).__cancelId)).toBe('due');
 await page.goto('/tests/audit/index.html?role=user&route=/dashboard/portfolio');
 await page.getByRole('button',{name:'Browse traders',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Trader directory',exact:true})).toBeVisible();
});

test('admin trader validation, pending writes and failure recovery', async ({page})=>{
 await page.setViewportSize({width:375,height:900}); await page.route('https://**/*',r=>r.abort());
 await page.goto('/tests/audit/index.html?role=admin&route=/admin');
 await page.getByRole('button',{name:'Open admin navigation'}).click(); await page.getByRole('button',{name:'Traders List',exact:true}).click();
 await page.getByRole('button',{name:'Add Trader',exact:true}).click();
 await page.getByRole('button',{name:'Create Trader',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('Enter a trader name');
 await page.getByLabel('Name',{exact:true}).fill('New trader');
 await page.getByLabel('Profit Days',{exact:true}).fill('30'); await page.getByLabel('Minimum Copy Amount',{exact:true}).fill('100');await page.getByLabel('Maximum Copy Amount',{exact:true}).fill('50');
 await page.getByRole('button',{name:'Create Trader',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Maximum amount');
 await page.getByLabel('Maximum Copy Amount',{exact:true}).fill('0');
 await page.evaluate(()=>{(window as any).__audit.state.adminCreateTrader=(data:any)=>{(window as any).__createdTrader=data;return new Promise((_,reject)=>{(window as any).__rejectTrader=reject;});};(window as any).__audit.emit();});
 await page.getByRole('button',{name:'Create Trader',exact:true}).click();await expect(page.getByRole('button',{name:'Create Trader',exact:true})).toBeDisabled();
 await page.evaluate(()=>(window as any).__rejectTrader(new Error('Save rejected')));await expect(page.getByRole('alert')).toContainText('Save rejected');
 await expect(page.getByLabel('Name',{exact:true})).toHaveValue('New trader');
 expect(await page.evaluate(()=>(window as any).__createdTrader.chartData)).toEqual([]);
 await page.screenshot({path:'test-results/audit/copy-admin-mobile.png',fullPage:true});
 page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Edit Test Trader',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Renamed trader');
 await page.evaluate(()=>{const f=(window as any).__audit;f.state.adminUpdateTrader=async(_id:string,data:any)=>{(window as any).__updatedTrader=data;};f.emit();});
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Updated trader');
 expect(await page.evaluate(()=>(window as any).__updatedTrader)).toEqual({name:'Renamed trader'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);
});
