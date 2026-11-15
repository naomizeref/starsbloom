import { test, expect } from '@playwright/test';
import { buildEmail } from '../../src/lib/emailTemplates';

test('account mail includes a session token and handles failed delivery without changing account state', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  let requests = 0;
  await page.route('**/api/send-email', async route => {
    requests++;
    expect(route.request().headers().authorization).toBe('Bearer fixture-access-token');
    const body = route.request().postDataJSON();
    expect(body.metadata.eventId).toBeTruthy();
    await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Private proxy error</html>' });
  });
  await page.goto('/tests/audit/index.html?role=user&route=/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/emailClient.ts';
    const { sendTransactionalEmail } = await import(modulePath);
    return sendTransactionalEmail('test@example.com', 'WELCOME');
  });
  expect(result.success).toBe(false);
  expect(result.error).not.toContain('<html>');
  expect(requests).toBe(1);
  expect(await page.evaluate(() => (window as any).__audit.state.user.balance)).toBe(1000);
  await page.goto('/tests/audit/index.html?role=guest&route=/login');
  await expect(page.getByRole('button', { name: /sign in/i }).last()).toBeVisible();
  const guestResult = await page.evaluate(async () => {
    const modulePath = '/src/lib/emailClient.ts';
    const { sendTransactionalEmail } = await import(modulePath);
    return sendTransactionalEmail('test@example.com', 'WELCOME');
  });
  expect(guestResult.success).toBe(false); expect(requests).toBe(1);
});

for (const width of [375, 820]) test(`emails fit a ${width}px screen with readable codes and details`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const type of ['EMAIL_VERIFICATION', 'INVESTMENT_COMPLETED', 'SUPPORT_TICKET_REPLY']) {
    const email = buildEmail(type, { code: '123456', name: 'Jamie', investmentName: 'Starter', payoutAmount: 125,
      profit: 25, reference: 'event-reference-123', replyPreview: 'Your receipt has been reviewed. Please check your dashboard.', siteUrl: 'https://bloom.example.com' });
    await page.setContent(email.html);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (type === 'EMAIL_VERIFICATION') await expect(page.getByText('123456', { exact: true })).toBeVisible();
    else await expect(page.getByRole('link', { name: 'View in Bloom' })).toHaveAttribute('href', /^https:\/\/bloom.example.com\//);
    await page.screenshot({ path: `test-results/audit/email-${type}-${width}.png`, fullPage: true });
  }
});
