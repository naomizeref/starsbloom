import { test, expect } from '@playwright/test';
test('profile reads cannot run inside auth callbacks or restore a previous admin session',async({page})=>{
  await page.goto('/tests/browser/auth.html');
  await expect(page.getByLabel('Identity')).toBeVisible();
  await page.evaluate(()=>{(window as any).__auth.switch('A');});
  await page.evaluate(()=>{(window as any).__auth.switch('B');(window as any).__auth.releaseInitial();});
  await expect(page.getByLabel('Identity')).toHaveText('{"id":"B","profile":"B","admin":false}');
  await page.waitForTimeout(1000);
  await expect(page.getByLabel('Identity')).toHaveText('{"id":"B","profile":"B","admin":false}');
  expect(await page.evaluate(()=>(window as any).__auth.violation())).toBe(false);
  await page.evaluate(()=>{(window as any).__auth.switch(null);});
  await expect(page.getByLabel('Identity')).toHaveText('{"admin":false}');
});
