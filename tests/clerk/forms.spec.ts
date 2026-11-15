import { test, expect, type Page } from '@playwright/test';

const id = '22222222-2222-4222-8222-222222222222';
test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.chatway.app/**', route => route.abort());
  await page.route('https://fixture.supabase.co/**', route => route.fulfill({ json: { id, email: 'test@example.invalid', role: 'user', status: 'active' } }));
  await page.route('**/api/clerk-session', route => route.fulfill({ json: { user: { id, email: 'test@example.invalid', user_metadata: { name: 'Bloom Test' } } } }));
});

async function fillSignup(page: Page) {
  await page.getByLabel(/^Username/).fill('bloomtest');
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.getByLabel(/^Confirm/).fill('Fixture-password-123!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/^First name/).fill('Bloom');
  await page.getByLabel(/^Last name/).fill('Test');
  await page.getByLabel(/^Sex/).selectOption('Other');
  await page.getByLabel(/^Phone number/).fill('+2348000000000');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/^Account type/).selectOption('Silver');
  await page.getByRole('button', { name: /Choose country/i }).click();
  await page.getByPlaceholder('Search country...').fill('Nigeria');
  await page.getByRole('option', { name: /Nigeria/ }).click();
  await page.getByLabel(/^Currency/).selectOption('USD');
  await page.getByLabel(/I accept the/).check();
}

test('original three-step signup verifies through Clerk and never uses legacy auth', async ({ page }) => {
  const legacyRequests: string[] = [];
  page.on('request', request => { if (/auth-codes|\/auth\/v1\//.test(request.url())) legacyRequests.push(request.url()); });
  await page.goto('/tests/clerk/auth.html');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByText('Step 1 of 3', { exact: false })).toBeVisible();
  await fillSignup(page);
  await expect(page.locator('#clerk-captcha')).toHaveCount(1);
  await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
  await page.evaluate(() => { (window as any).__authTest.badCode = true; });
  await page.getByLabel('Verification code').fill('111111');
  await page.getByRole('button', { name: /Verify & activate/ }).click();
  await expect(page.getByText('That verification code is incorrect.')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__authTest.calls.some((call: any) => call.method === 'setActive'))).toBe(false);
  await page.evaluate(() => { (window as any).__authTest.badCode = false; });
  await page.getByLabel('Verification code').fill('123456');
  await page.getByRole('button', { name: /Verify & activate/ }).click();
  await expect(page.getByLabel('Identity')).toContainText(id);
  const calls = await page.evaluate(() => (window as any).__authTest.calls);
  const profile = calls.find((call: any) => call.method === 'signup.create').params.unsafeMetadata.bloomProfile;
  expect(profile).toMatchObject({ firstName: 'Bloom', username: 'bloomtest', country: 'Nigeria', currency: 'USD', accountType: 'Silver' });
  expect(profile).not.toHaveProperty('password');
  expect(profile).not.toHaveProperty('role');
  expect(legacyRequests).toEqual([]);
});

test('verification delivery retry reuses the pending Clerk signup', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html');
  await fillSignup(page);
  await page.evaluate(() => { (window as any).__authTest.failSend = true; });
  await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(page.getByText('Please wait before requesting another code.')).toBeVisible();
  await page.evaluate(() => { (window as any).__authTest.failSend = false; });
  await page.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__authTest.calls.filter((call: any) => call.method === 'signup.create').length)).toBe(1);
});

test('original login opens a mapped session and additional security cannot be skipped', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.evaluate(() => { (window as any).__authTest.needsMfa = true; });
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible();
  await expect(page.getByText('Unexpected second Clerk login form')).toHaveCount(0);
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__authTest.calls.some((call: any) => call.method === 'setActive'))).toBe(false);
  await page.getByLabel('Verification code').fill('111111');
  await page.evaluate(() => { (window as any).__authTest.badCode = true; });
  await page.getByRole('button', { name: 'Verify & sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('That security code is incorrect.');
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__authTest.badCode = false; });
  await page.getByLabel('Verification method').selectOption({ label: 'Backup code' });
  await page.getByLabel('Backup code', { exact: true }).fill('backup-fixture');
  await page.getByRole('button', { name: 'Verify & sign in' }).click();
  await expect(page.getByLabel('Identity')).toContainText(id);
  const calls = await page.evaluate(() => (window as any).__authTest.calls);
  expect(calls.filter((call: any) => call.method === 'signin.create')).toHaveLength(1);
  expect(calls.filter((call: any) => call.method === 'signin.verifySecond').map((call: any) => call.params.strategy)).toEqual(['totp', 'backup_code']);
});

for (const strategy of ['email_code', 'phone_code']) {
  test(`new-device ${strategy} stays inside Bloom and reuses the password sign-in`, async ({ page }) => {
    await page.goto('/tests/clerk/auth.html?tab=login');
    await page.evaluate(strategy => {
      const state = (window as any).__authTest;
      state.needsTrust = true;
      state.factors = [strategy === 'email_code' ? { strategy, emailAddressId: 'email_fixture', safeIdentifier: 't***@example.invalid' }
        : { strategy, phoneNumberId: 'phone_fixture', safeIdentifier: '***1234' }];
    }, strategy);
    await page.getByLabel(/^Email address/).fill('test@example.invalid');
    await page.getByLabel(/^Password/).fill('Fixture-password-123!');
    await page.getByLabel(/^Password/).press('Enter');
    await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible();
    await expect(page.getByText('Confirm this device to finish signing in.')).toBeVisible();
    await expect(page.getByLabel(/^Email address/)).toHaveCount(0);
    await page.evaluate(() => { (window as any).__authTest.failSend = true; });
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to send the verification code. Try again.');
    await page.evaluate(() => { (window as any).__authTest.failSend = false; });
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
    await page.getByLabel('Verification code').fill('123456');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (strategy === 'email_code') await page.screenshot({ path: 'test-results/clerk/signin-verification-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Verify & sign in' }).click();
    await expect(page.getByLabel('Identity')).toContainText(id);
    const calls = await page.evaluate(() => (window as any).__authTest.calls);
    expect(calls.filter((call: any) => call.method === 'signin.create')).toHaveLength(1);
    expect(calls.find((call: any) => call.method === 'signin.sendSecond').params).toEqual(strategy === 'email_code'
      ? { strategy, emailAddressId: 'email_fixture' } : { strategy, phoneNumberId: 'phone_fixture' });
  });
}

test('passkey challenge completes the existing sign-in attempt', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await page.evaluate(() => {
    const state = (window as any).__authTest;
    state.needsMfa = true;
    state.factors = [{ strategy: 'passkey' }];
  });
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.getByLabel(/^Password/).press('Enter');
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with passkey' }).click();
  await expect(page.getByLabel('Identity')).toContainText(id);
  const calls = await page.evaluate(() => (window as any).__authTest.calls);
  expect(calls.filter((call: any) => call.method === 'signin.create')).toHaveLength(1);
  expect(calls.filter((call: any) => call.method === 'signin.passkey')).toHaveLength(1);
});

test('unsupported challenges block access and allow returning to the original form', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await page.evaluate(() => {
    const state = (window as any).__authTest;
    state.needsMfa = true;
    state.factors = [{ strategy: 'future_security_challenge' }];
  });
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.getByLabel(/^Password/).press('Enter');
  await expect(page.getByRole('alert')).toContainText('verification method that is not available here');
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__authTest.calls.some((call: any) => call.method === 'setActive'))).toBe(false);
  await page.getByRole('button', { name: /Return to sign in/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('mandatory password replacement completes in Bloom without a second login form', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await page.evaluate(() => { (window as any).__authTest.needsNewPassword = true; });
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.getByLabel(/^Password/).press('Enter');
  await expect(page.getByRole('heading', { name: 'Update your password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Replacement-password-123!');
  await page.getByLabel('Confirm new password').fill('Mismatch');
  await page.getByRole('button', { name: 'Update password & sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match.');
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  await page.getByLabel('Confirm new password').fill('Replacement-password-123!');
  await page.getByRole('button', { name: 'Update password & sign in' }).click();
  await expect(page.getByLabel('Identity')).toContainText(id);
});

test('ordinary password login activates the session from the original form', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByLabel(/^Password/).fill('Fixture-password-123!');
  await page.getByLabel(/^Password/).press('Enter');
  await expect(page.getByLabel('Identity')).toContainText(id);
  expect(await page.evaluate(() => (window as any).__authTest.calls.find((call: any) => call.method === 'signin.create').params.strategy)).toBe('password');
});

test('original reset form uses Clerk, rejects incorrect codes and activates only on success', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html?tab=login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel(/^Email address/).fill('test@example.invalid');
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await page.getByLabel('Reset code').fill('111111');
  await page.getByLabel('New password').fill('New-fixture-password-123!');
  await page.evaluate(() => { (window as any).__authTest.badCode = true; });
  await page.getByRole('button', { name: 'Reset password & sign in' }).click();
  await expect(page.getByText('That reset code is incorrect.')).toBeVisible();
  await expect(page.getByLabel('Identity')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__authTest.badCode = false; });
  await page.getByLabel('Reset code').fill('123456');
  await page.getByLabel('New password').press('Enter');
  await expect(page.getByLabel('Identity')).toContainText(id);
  const calls = await page.evaluate(() => (window as any).__authTest.calls);
  expect(calls.find((call: any) => call.method === 'signin.create').params.strategy).toBe('reset_password_email_code');
});

test('restored layout fits mobile and desktop and inputs keep focus while typing', async ({ page }) => {
  await page.goto('/tests/clerk/auth.html');
  await page.getByLabel(/^Username/).fill('bloomtest');
  await expect(page.getByLabel(/^Username/)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByLabel(/^Username/).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: 'test-results/clerk/auth-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/clerk/auth-desktop.png', fullPage: true });
});
