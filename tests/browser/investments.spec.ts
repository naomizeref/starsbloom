import { test, expect } from '@playwright/test';
for (const width of [375,1440]) {
  test(`investment catalog recovery, admin writes and session isolation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900});
    await page.route('https://**/*',route=>route.abort());
    const crashes: string[]=[];
    page.on('pageerror',e=>crashes.push(e.message));
    await page.goto('/tests/browser/investments.html');
    await expect(page.getByText(/Unable to refresh investment plans/)).toBeVisible();
    await expect(page.getByText('Gold Tier', {exact:true})).toHaveCount(0);
    await page.evaluate(()=>{(window as any).__investments.controls.failRead=false;});
    await page.getByRole('button',{name:'Retry loading'}).click();
    await expect(page.getByRole('heading',{name:'Investment Plans',exact:true})).toBeVisible();
    await expect(page.getByText('Saved plan',{exact:true}).first()).toBeVisible();
    await expect(page.getByLabel('Loaded holdings')).toHaveText('Saved holding');
    await page.evaluate(async()=>{const f=(window as any).__investments;f.controls.failPortfolio=true;await f.holdings.refreshPortfolio();});
    await expect(page.getByRole('alert')).toContainText('Unable to refresh portfolio holdings');
    await expect(page.getByLabel('Loaded holdings')).toHaveText('Saved holding');
    await page.evaluate(()=>{(window as any).__investments.controls.failPortfolio=false;});
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Investment amount in USD').fill('10.50');
    await page.locator('form').getByRole('button',{name:'Invest Now',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Investment accepted'})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).__investments.controls.lastAmount)).toBe(10.5);
    // Empty -> populated -> empty catalogs must not change React hook order.
    await page.evaluate(async()=>{const f=(window as any).__investments; f.rows.investment_plans=[]; await f.catalog.refreshPlans();});
    await expect(page.getByText('No investment plans are currently available.')).toBeVisible();
    await expect(page.getByText('Existing saved position',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/Claim Payout/})).toBeVisible();
    expect(crashes).toEqual([]);
    await page.getByRole('button',{name:'Admin plans'}).click();
    await page.getByRole('button',{name:'New Plan'}).click();
    await page.getByPlaceholder('Plan Name',{exact:true}).fill('New stored plan');
    await page.getByPlaceholder('Min Investment ($)',{exact:true}).fill('10');
    await page.getByPlaceholder('Max Investment ($)',{exact:true}).fill('1000');
    await page.getByPlaceholder('ROI %',{exact:true}).fill('10');
    await page.getByPlaceholder('Duration Days',{exact:true}).fill('30');
    await page.getByPlaceholder('Description',{exact:true}).fill('Test terms');
    await page.evaluate(()=>{(window as any).__investments.controls.failWrite=true;});
    await page.getByRole('button',{name:'Create Plan',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Unable to save plan');
    await expect(page.getByPlaceholder('Plan Name',{exact:true})).toHaveValue('New stored plan');
    await page.evaluate(()=>{Object.assign((window as any).__investments.controls,{failWrite:false,zeroRows:true});});
    await page.getByRole('button',{name:'Create Plan',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Unable to save plan');
    await page.evaluate(()=>{(window as any).__investments.controls.zeroRows=false;});
    await page.getByRole('button',{name:'Create Plan',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Created plan:'})).toContainText('Created plan: New stored plan');
    // A late response for the previous account cannot repopulate its positions.
    await page.evaluate(()=>{const f=(window as any).__investments;f.controls.delayA=true;void f.positions.refreshActiveInvestments();f.setOwner('B');});
    await expect(page.getByLabel('Loaded positions')).toHaveText('Position for B');
    await page.waitForTimeout(1100);
    await expect(page.getByLabel('Loaded positions')).toHaveText('Position for B');
    expect(await page.evaluate(()=>(window as any).__investments.traders.traders[0].maximumCopyAmount)).toBeUndefined();
    await page.evaluate(async()=>{const f=(window as any).__investments;Object.assign(f.rows.traders[0],{min_copy_amount:null,minimum_copy_amount:1000,max_copy_amount:null,maximum_copy_amount:999,max_followers:42});await f.traders.refreshTraders();});
    expect(await page.evaluate(()=>{const t=(window as any).__investments.traders.traders[0];return {min:t.minimumCopyAmount,max:t.maximumCopyAmount,capacity:t.maxFollowers};})).toEqual({min:0,max:undefined,capacity:42});
    // Trader writes follow the same confirmed-result contract.
    const failure = await page.evaluate(async()=>{const f=(window as any).__investments; f.controls.failWrite=true;try { await f.traders.adminUpdateTrader('trader-test',{name:'Unsaved trader'});return 'unexpected success'; } catch { return f.rows.traders[0].name; }});
    expect(failure).toBe('Saved trader');
    await page.evaluate(async()=>{const f=(window as any).__investments; f.controls.failWrite=false; await f.traders.adminUpdateTrader('trader-test',{minimumCopyAmount:25,maximumCopyAmount:0});});
    expect(await page.evaluate(()=>{const row=(window as any).__investments.rows.traders[0];return [row.min_copy_amount,row.minimum_copy_amount,row.max_copy_amount,row.maximum_copy_amount];})).toEqual([25,25,0,0]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    expect(crashes).toEqual([]);
  });
}
