import { defineConfig } from '@playwright/test';
export default defineConfig({
  maxFailures: 1, testDir: '.', testMatch: '*.spec.ts', workers: 1,
  outputDir: '../../test-results/browser', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5187', launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] } },
  webServer: { command: 'npx vite --config tests/browser/vite.config.ts', url: 'http://127.0.0.1:5187/tests/browser/index.html', cwd: '../..', reuseExistingServer: false },
});
