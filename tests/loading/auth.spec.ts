import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as any).__clerkInitiallyLoading = true; });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://cdn.chatway.app/**', route => route.abort());
  await page.route('https://fixture.supabase.co/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: ['app_settings', 'site_content'].some(table => url.pathname.endsWith('/'+table)) ? { value: {} } : [] });
  });
  await page.route('**/api/markets', route => route.fulfill({ json: { tradingReady: true, crypto: [], stocks: [] } }));
});

test('login renders before Clerk connects, keeps typed input and defers market traffic', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Connecting securely');
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  const submit = page.locator('button[type=submit]').filter({ hasText: 'Sign in' });
  await expect(submit).toBeDisabled();
  await page.getByLabel(/^Password/).press('Enter');
  expect(await page.evaluate(() => (window as any).__authTest.calls)).toEqual([]);
  await page.evaluate(() => (window as any).__clerk.finishLoading());
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel(/^Email address/)).toHaveValue('test@example.invalid');
  await expect(page.getByLabel(/^Password/)).toBeFocused();
  expect(requests.filter(url => /\/api\/markets|\/rest\/v1\/(traders|investment_plans)|GlobalModals\.tsx|DashboardLayout\.tsx/.test(url))).toEqual([]);
  expect(requests.filter(url => /auth-codes|\/auth\/v1\//.test(url))).toEqual([]);
  // The catalogs must resume when leaving auth, without a hard reload.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Markets', exact: true }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect.poll(() => requests.some(url => url.includes('/api/markets'))).toBe(true);
  await expect.poll(() => requests.some(url => url.includes('/rest/v1/traders'))).toBe(true);
  await expect.poll(() => requests.some(url => url.includes('/rest/v1/investment_plans'))).toBe(true);
});

test('registration can be filled during startup but private routes remain gated', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel(/^Username/).fill('bloomtest');
  await page.evaluate(() => (window as any).__clerk.finishLoading());
  await expect(page.getByLabel(/^Username/)).toHaveValue('bloomtest');
  await expect(page.getByLabel(/^Username/)).toBeFocused();
  await page.goto('/dashboard');
  await expect(page.getByRole('status')).toHaveText('Opening Bloom…');
  await expect(page.getByRole('heading', { name: 'Asset Overview' })).toHaveCount(0);
  await page.evaluate(() => (window as any).__clerk.finishLoading());
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
});

test('a stalled external font stylesheet does not delay the form', async ({ page }) => {
  let releaseFont = () => {};
  await page.route('https://fonts.googleapis.com/**', async route => {
    await new Promise<void>(resolve => { releaseFont = resolve; });
    await route.fulfill({ contentType: 'text/css', body: '' }).catch(() => {});
  });
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('link[href*="fonts.googleapis.com/css2"]')).toHaveAttribute('media', 'print');
    await page.getByLabel(/^Email address/).fill('test@example.invalid');
    await expect(page.getByLabel(/^Email address/)).toBeFocused();
  } finally { releaseFont(); }
});

test('homepage remains visible with Clerk and animations unavailable; video loads near viewport only', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('**/js/webflow*.js', route => route.abort());
  await page.route('**/media/**', route => route.fulfill({ contentType: 'video/mp4', body: '' }));
  await page.goto('/');
  const home = page.frameLocator('iframe[title="Static Homepage"]');
  await expect(home.getByRole('heading', { name: /Learn. Invest. Automate/ })).toBeVisible();
  await expect(home.locator('[data-bloom-reveal]').first()).toHaveCSS('opacity', '1');
  expect(requests.filter(url => /\/media\/|\/api\/markets|\/rest\/v1\/(traders|investment_plans)/.test(url))).toEqual([]);
  await home.locator('video[data-lazy-video]').first().scrollIntoViewIfNeeded();
  await expect.poll(() => requests.some(url => url.includes('/media/'))).toBe(true);
  await expect(home.locator('video[data-lazy-video]').first()).toHaveAttribute('data-loaded', 'true');
  await home.locator('.w-nav-button').scrollIntoViewIfNeeded();
  await home.locator('.w-nav-button').click();
  await expect(home.locator('.w-nav-button')).toHaveAttribute('aria-expanded', 'true');
  await expect(home.locator('.w-nav-menu a[href="/login"]').first()).toBeVisible();
});

test('a stalled SDK offers recovery on private pages instead of spinning forever', async ({ page }) => {
  await page.clock.install();
  await page.goto('/dashboard');
  await expect(page.getByRole('status')).toHaveText('Opening Bloom…');
  await page.clock.fastForward(16000);
  await expect(page.getByRole('alert')).toContainText('Sign-in is taking longer');
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'Asset Overview' })).toHaveCount(0);
});

test('direct homepage load keeps mobile navigation working with deferred scripts', async ({ page }) => {
  await page.goto('/landing.html');
  await expect(page.getByRole('heading', { name: /Learn. Invest. Automate/ })).toBeVisible();
  await page.locator('.w-nav-button').click();
  await expect(page.locator('.w-nav-button')).toHaveAttribute('aria-expanded', 'true');
  const login = page.locator('.w-nav-menu a[href="/login"]').first();
  await expect(login).toBeVisible();
  await page.screenshot({ path: 'test-results/loading/home-menu-mobile.png' });
  await login.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('an open early menu stays open when deferred navigation initializes', async ({ page }) => {
  let resume = () => {};
  await page.route('**/js/webflow.7b0b0439.1577ddcd3db2cfb1.js', async route => {
    await new Promise<void>(resolve => { resume = resolve; });
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/landing.html', { waitUntil: 'commit' });
    const menu = page.getByRole('button', { name: 'menu', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.w-nav-menu a[href="/login"]').first()).toBeVisible();
    resume();
    await expect(menu).toHaveAttribute('aria-controls', /w-nav-overlay/);
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.w-nav-menu a[href="/login"]').first()).toBeVisible();
  } finally { resume(); }
});
