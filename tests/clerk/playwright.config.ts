import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,timeout:30000,outputDir:'../../test-results/clerk',reporter:'list',
  use:{baseURL:'http://127.0.0.1:5189',viewport:{width:375,height:812},launchOptions:{executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']}},
  webServer:{command:'npx vite --config tests/clerk/vite.config.ts',url:'http://127.0.0.1:5189/tests/clerk/index.html',cwd:'../..',reuseExistingServer:false}});
