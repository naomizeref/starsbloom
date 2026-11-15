import { test, expect, type Page } from '@playwright/test';
const file = { name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCmcAAAAASUVORK5CYII=', 'base64') };
const set = (page: Page, values: object) => page.evaluate(values => Object.assign((window as any).__bloom.controls, values), values);
const counts = (page: Page) => page.evaluate(() => { const { controls, state } = (window as any).__bloom; return { uploads: controls.uploads.length, deposits: controls.deposits.length, balance: state.user.balance }; });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
for (const width of [375, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.route('https://**/*', route => route.abort());
      await page.goto('/tests/browser/index.html');
    });
    for (const quick of [false, true]) for (const gift of [false, true]) {
      test(`${quick ? 'quick' : 'wallet'} ${gift ? 'gift card' : 'crypto'} upload failure, save failure, retry and private admin review`, async ({ page }) => {
        if (quick) { await page.getByRole('button', { name: 'Quick deposit', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Fast Deposit' })).toBeVisible(); }
        if (gift) {
          await page.getByLabel('Payment Method').last().selectOption('gift_card');
          await page.getByLabel('Amount (USD)', { exact: true }).fill('25');
          await page.getByLabel('Card face value').fill('30');
          await page.getByLabel('Upload gift card images').setInputFiles([file, { ...file, name: 'back.png' }]);
        } else {
          await page.getByPlaceholder('Min. Deposit: 1 USD').last().fill('25');
          await page.getByLabel('Upload deposit proof').last().setInputFiles(file);
        }
        await noOverflow(page);
        await set(page, { failUpload: true });
        await page.getByRole('button', { name: /^confirm deposit$/i }).last().click();
        await expect(page.getByRole('alert').last()).toContainText(/upload/i);
        expect(await counts(page)).toEqual({ uploads: 0, deposits: 0, balance: 100 });
        await set(page, { failUpload: false, failSave: true });
        await page.getByRole('button', { name: /^confirm deposit$/i }).last().click();
        await expect(page.getByRole('alert').last()).toContainText(/save|saved/i);
        const uploaded = gift ? 2 : 1;
        expect(await counts(page)).toEqual({ uploads: uploaded, deposits: 0, balance: 100 });
        await set(page, { failSave: false });
        await page.getByRole('button', { name: /^confirm deposit$/i }).last().click();
        await expect.poll(async () => (await counts(page)).deposits).toBe(1);
        expect(await counts(page)).toEqual({ uploads: uploaded, deposits: 1, balance: 100 });
        if (quick) await page.getByRole('button', { name: 'Close deposit' }).click();
        await page.getByRole('button', { name: 'deposits', exact: true }).click();
        await page.getByRole('button', { name: `View ${uploaded} image${gift ? 's' : ''}`, exact: true }).click();
        await expect(page.getByRole('link', { name: /full.size/i }).first()).toBeVisible();
        await noOverflow(page);
        await page.getByRole('button', { name: 'Approve', exact: true }).click();
        await expect.poll(async () => (await counts(page)).balance).toBe(125);
        await page.screenshot({ path: `test-results/${width}-${quick ? 'quick' : 'wallet'}-${gift ? 'gift' : 'crypto'}.png`, fullPage: true });
      });
    }
    test('KYC uploads preserve completed files on failure and support reviewed images', async ({ page }) => {
      await page.getByRole('button', { name: 'kyc', exact: true }).click();
      await page.getByLabel('ID number').fill('TEST-ID');
      await page.getByLabel('Date of birth').fill('1990-01-01');
      await page.getByLabel('Residential address').fill('12 Test Street');
      await page.getByLabel('City', { exact: false }).fill('Lagos');
      await page.getByRole('button', { name: /Choose country/ }).click();
      await page.getByPlaceholder("Search country...").fill('Nigeria');
      await page.getByRole('option', { name: /Nigeria/ }).click();
      await page.getByLabel('Front of ID', { exact: false }).setInputFiles(file);
      await page.getByLabel('Back of ID', { exact: false }).setInputFiles({ ...file, name: 'back.png' });
      await set(page, { failSave: true });
      await page.getByRole('button', { name: 'Submit verification', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(/database failure/);
      expect((await counts(page)).uploads).toBe(2);
      await set(page, { failSave: false });
      await page.getByRole('button', { name: 'Submit verification', exact: true }).click();
      await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
      expect((await counts(page)).uploads).toBe(2);
      await page.getByRole('button', { name: 'review', exact: true }).click();
      await page.getByRole('button', { name: 'View (2)' }).click();
      await expect(page.getByRole('link', { name: 'Open full-size image' }).first()).toBeVisible();
      await noOverflow(page);
      for (const image of await page.getByRole('img', { name: /identity document/ }).all()) {
        const box = await image.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(page.getByText('KYC approved for test@example.com')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: `test-results/${width}-kyc.png`, fullPage: true });
    });
  });
}
