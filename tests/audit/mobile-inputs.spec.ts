import { test, expect } from '@playwright/test';

const fields = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

for (const width of [375, 820]) {
  test(`mobile forms keep readable input sizes before and during typing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://**/*', route => route.abort());
    for (const [role, route] of [
      ['guest', '/login'], ['user', '/dashboard/trading'],
      ['user', '/dashboard/settings'], ['user', '/copy-trading'],
    ]) {
      await page.goto(`/tests/audit/index.html?role=${role}&route=${route}`);
      await expect(page.locator(fields).first()).toBeVisible();
      const sizes = await page.locator(fields).evaluateAll(elements => elements
        .filter(element => element.getBoundingClientRect().height > 0)
        .map(element => parseFloat(getComputedStyle(element).fontSize)));
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes.every(size => size >= 16), `${route}: ${sizes}`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2);
    }

    await page.getByRole('button', { name: 'Review Test Trader', exact: true }).click();
    const amount = page.getByLabel('Allocation amount (USD)');
    await expect(amount).toBeFocused();
    expect(await amount.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await amount.fill('');
    const before = await amount.boundingBox();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await amount.pressSequentially('125.50');
    await expect(amount).toHaveValue('125.50');
    await expect(amount).toBeFocused();
    const after = await amount.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.width).toBeCloseTo(before!.width, 0);
    expect(after!.height).toBeCloseTo(before!.height, 0);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scrollBefore, 0);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/);
    await page.getByRole('button', { name: 'Close allocation' }).click();
    await expect(page.getByRole('button', { name: 'Review Test Trader', exact: true })).toBeFocused();

    await page.goto('/tests/audit/index.html?role=user&route=/dashboard/support');
    const message = page.getByLabel('Support message');
    await expect(message).toBeVisible();
    expect(await message.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await message.fill('Checking that the message field stays readable.');
    await expect(message).toBeFocused();
    expect(await page.getByLabel('Ticket category').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);

    await page.goto('/tests/audit/index.html?role=admin&route=/admin');
    await page.getByRole('button', { name: 'Open admin navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Business Settings', exact: true }).click();
    await expect(page.locator(fields).first()).toBeVisible();
    const adminSizes = await page.locator(fields).evaluateAll(elements => elements
      .filter(element => element.getBoundingClientRect().height > 0)
      .map(element => parseFloat(getComputedStyle(element).fontSize)));
    expect(adminSizes.every(size => size >= 16)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2);
  });
}

test('desktop trade fields retain their compact sizing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://**/*', route => route.abort());
  await page.goto('/tests/audit/index.html?role=user&route=/dashboard/trading');
  await expect(page.getByLabel('Order amount (USD)')).toBeVisible();
  expect(await page.getByLabel('Order amount (USD)').evaluate(element => getComputedStyle(element).fontSize)).toBe('14px');
});
