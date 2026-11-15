import { test, expect } from '@playwright/test';

for (const width of [375, 820]) {
  test(`refreshing data and opening menus preserve the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route('https://**/*', route => route.abort());
    await page.goto('/tests/audit/index.html?role=user&route=/dashboard');
    const heading = page.getByRole('heading', { name: 'Asset Overview', exact: true });
    await expect(heading).toBeVisible();
    // Let the one-time opacity entrance finish before measuring idle geometry.
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 350));
    const geometry = () => page.evaluate(() => ({
      y: scrollY,
      height: document.documentElement.scrollHeight,
      main: document.querySelector('main')!.getBoundingClientRect().toJSON(),
    }));
    const before = await geometry();
    expect(before.y).toBeGreaterThan(0);
    for (const loading of [true, false, true, false]) {
      await page.evaluate(value => {
        const fixture = (window as any).__audit;
        fixture.state.investmentDataLoading = value;
        fixture.emit();
      }, loading);
      await page.waitForTimeout(80);
      expect(await geometry()).toEqual(before);
    }
    const movingDecorations = await page.locator('.animate-pulse, .animate-bounce').evaluateAll(elements =>
      elements.filter(el => getComputedStyle(el).animationName !== 'none').length);
    expect(movingDecorations).toBe(0);

    const mainWidth = before.main.width;
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    const menu = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await expect(menu).toBeVisible();
    expect(await page.locator('main').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(mainWidth, 0);
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    // The menu can scroll independently while the document stays frozen.
    await menu.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.getByRole('button', { name: 'Close navigation menu' }).click();
    await expect(menu).toHaveCount(0);
    expect(await geometry()).toEqual(before);
    expect(await page.evaluate(() => document.body.style.position)).toBe('');

    // Navigation from a locked menu releases the old position, including when
    // the old component cleans up after the route's reset has already run.
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    await menu.getByRole('button', { name: 'Trade', exact: true }).click();
    await expect(page.getByLabel('Order amount (USD)')).toBeVisible();
    expect(await page.evaluate(() => document.body.style.position)).toBe('');
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
    await page.getByRole('button', { name: 'Close navigation menu' }).click();
    expect(await page.evaluate(() => document.body.style.position)).toBe('');

    // Actual failures must still be visible and retryable.
    await page.goto('/tests/audit/index.html?role=user&route=/dashboard');
    await expect(heading).toBeVisible();
    await page.evaluate(() => {
      const fixture = (window as any).__audit;
      fixture.state.investmentDataError = 'Unable to refresh your positions.';
      fixture.emit();
    });
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to refresh your positions.' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__audit.controls.calls)).toContain('refreshInvestmentData');
  });
}
