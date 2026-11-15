import { test, expect } from '@playwright/test';
for(const width of [375,430,1440])test(`compact trade layout keeps orders ahead of optional markets at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('https://**/*',route=>route.abort());
 await page.goto('/tests/audit/index.html?role=user&route=/dashboard/trading');
 await page.evaluate(()=>{const f=(window as any).__audit;
  f.state.marketCrypto=[{...f.state.marketCrypto[0],price:77358,change:0.14728,sparkline:[76400,76800,76600,77200,76900,77400,77358]},
   {...f.state.marketCrypto[0],symbol:'SHIB/USD',name:'Shiba Inu',price:0.00001234,change:0.66322}];
  f.state.user.portfolio=[{symbol:'BTC',name:'Bitcoin',amount:0.01,avgBuyPrice:70000,currentPrice:77358,type:'crypto'}];
  f.state.marketStocks=[];f.emit();
 });
 await expect(page.getByRole('region',{name:'Selected market'})).toContainText('$77,358.00');
 await expect(page.getByRole('region',{name:'Selected market'})).toContainText('+0.15%');
 await expect(page.getByText('Stock orders are unavailable',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Quotes refresh automatically.',{exact:false})).toHaveCount(0);
 await expect(page.getByText('HEDGED COLD SECURE',{exact:false})).toHaveCount(0);
 const markets=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Market watchlist'})});
 await expect(markets).not.toHaveAttribute('open','');
 await expect(page.getByRole('button',{name:'Select Shiba Inu'})).not.toBeVisible();
 const order=await page.getByRole('region',{name:'Order ticket'}).boundingBox();
 const summary=await markets.locator('summary').boundingBox();
 expect(order!.y+order!.height).toBeLessThanOrEqual(summary!.y);
 await expect(page.getByText('Chart unavailable.',{exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/audit/trading-clean-${width}.png`,fullPage:true});
 await markets.locator('summary').click();
 await expect(page.getByRole('button',{name:'Select Shiba Inu'})).toContainText('$0.00001234');
 await page.getByRole('button',{name:'Select Shiba Inu'}).click();
 await expect(page.getByLabel('Active Trading Pair')).toHaveValue('SHIB/USD');
 await expect(page.getByRole('region',{name:'Selected market'})).toContainText('$0.00001234');
 await page.getByRole('button',{name:'Portfolio',exact:true}).click();
 await expect(page).toHaveURL(/dashboard\/portfolio/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
});
for(const width of [375,1440])test(`trading uses the displayed asset and blocks missing quotes at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('https://**/*',r=>r.abort());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/audit/index.html?role=user&route=/dashboard/trading');
 await expect(page.getByRole('heading',{name:'Place order',exact:true})).toBeVisible();
 await expect(page.getByText('Chart unavailable.')).toBeVisible();
 await expect(page.getByRole('img',{name:'BTC 7-day USD price history'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Limit',exact:true})).toHaveCount(0);await expect(page.getByRole('slider')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).__audit.state.executeTrade=async(...args:any[])=>{(window as any).__tradeArgs=args;return{success:true,message:'Test market order accepted'};};});
 await page.getByLabel('Order amount (USD)').fill('100.50');await page.locator('form button[type="submit"]').click();
 await expect(page.getByRole('status')).toContainText('Test market order accepted');
 expect(await page.evaluate(()=>(window as any).__tradeArgs)).toEqual(['BTC','Bitcoin','buy',100.5,50000,true]);
 await page.locator('summary').filter({hasText:'Market watchlist'}).click();
 await page.getByRole('button',{name:'Select Apple'}).click();
 await page.evaluate(()=>{(window as any).__audit.state.executeTrade=(...args:any[])=>{(window as any).__tradeArgs=args;return new Promise((_,reject)=>{(window as any).__rejectTrade=()=>reject(new Error('Unavailable'));});};});
 await page.getByLabel('Order amount (USD)').fill('20.50');await page.locator('form button[type="submit"]').click();
 await expect(page.locator('form button[type="submit"]')).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).__tradeArgs)).toEqual(['AAPL','Apple','buy',20.5,50000,false]);
 await page.evaluate(()=>(window as any).__rejectTrade());await expect(page.getByRole('alert')).toContainText('Unable to submit your order');
 await expect(page.getByLabel('Order amount (USD)')).toHaveValue('20.50');
 // Losing the selected quote must not change this order to Bitcoin.
 await page.evaluate(()=>{const f=(window as any).__audit;(window as any).__stocks=f.state.marketStocks;f.state.marketStocks=[];f.emit();});
 await expect(page.getByLabel('Active Trading Pair')).toHaveValue('AAPL');
 await expect(page.locator('form button[type="submit"]')).toBeDisabled();
 await page.evaluate(()=>{const f=(window as any).__audit;f.state.marketStocks=(window as any).__stocks;f.emit();});
 await page.screenshot({path:`test-results/audit/trading-${width}.png`,fullPage:true});
 // A quote that expires while the order form is open must not submit.
 await page.evaluate(()=>{const f=(window as any).__audit; for(const a of [...f.state.marketCrypto,...f.state.marketStocks]) a.updatedAt='2000-01-01T00:00:00Z';});
 await page.getByLabel('Order amount (USD)').fill('30');
 await expect(page.locator('form button[type="submit"]')).toBeDisabled();
 await page.goto('/tests/audit/index.html?role=user&data=empty&route=/dashboard/trading');
 await expect(page.getByRole('status')).toContainText('Price unavailable · Orders paused');
 await expect(page.locator('form button[type="submit"]')).toBeDisabled();
 await expect(page.getByText('$98,400.00')).toHaveCount(0);
 await page.locator('summary').filter({hasText:'Market watchlist'}).click();
 await expect(page.getByText('No prices available.',{exact:true})).toBeVisible();
 if(width<1024){
  const chart=await page.getByRole('region',{name:'BTC/USD price chart'}).boundingBox();
  const watchlist=await page.getByRole('heading',{name:/Market watchlist/}).boundingBox();
  expect(chart!.y).toBeLessThan(watchlist!.y);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);expect(errors).toEqual([]);
});

test('chart can retry a blocked script and follows every supported crypto pair',async({page})=>{
 await page.route('https://**/*',r=>r.abort());
 await page.goto('/tests/audit/index.html?role=user&route=/dashboard/trading');
 await expect(page.getByRole('button',{name:'Retry chart'})).toBeVisible();
 await page.route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',route=>route.fulfill({contentType:'text/javascript',body:`
  (()=>{
  const script=document.currentScript;
  window.__chartConfig=JSON.parse(script.textContent);
  const frame=document.createElement('iframe');
  frame.srcdoc='<p>Chart provider fixture</p>';
  script.parentElement.appendChild(frame);
  })();
 `}));
 await page.getByRole('button',{name:'Retry chart'}).click();
 await expect(page.getByTitle('BTC reference chart')).toBeVisible();
 await expect(page.getByText('Loading BTC chart…')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__chartConfig.interval)).toBe('60');
 expect(await page.evaluate(()=>(window as any).__chartConfig.allow_symbol_change)).toBe(false);
 expect(await page.evaluate(()=>(window as any).__chartConfig.hide_top_toolbar)).toBe(true);
 await page.getByRole('button',{name:'1D',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__chartConfig.interval)).toBe('D');
 await expect(page.getByRole('button',{name:'1D',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const symbol of ['BTC','ETH','SOL','XRP','ADA','BNB','DOT','DOGE','SHIB','LTC']){
  await page.evaluate(symbol=>{const f=(window as any).__audit;f.state.marketCrypto=[{...f.state.marketCrypto[0],symbol:`${symbol}/USD`,name:symbol}];f.emit();},symbol);
  await page.getByLabel('Active Trading Pair').selectOption(`${symbol}/USD`);
  await expect(page.getByTitle(`${symbol}/USD reference chart`)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__chartConfig.symbol)).toBe(`BINANCE:${symbol}USDT`);
 }
 await expect(page.getByText('Chart: USDT · Orders: USD')).toBeVisible();
});
