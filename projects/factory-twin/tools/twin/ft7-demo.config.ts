import { defineConfig } from '@playwright/test';
import { chromiumLaunchOptions } from '../../playwright/chromium';

export default defineConfig({
  testDir: '.',
  testMatch: process.env.DEMO ? new RegExp(process.env.DEMO) : /ft7\.demo\.ts$/,
  timeout: 3_600_000,
  workers: 1,
  expect: { timeout: 30_000 },
  reporter: [['line']],
  outputDir: '/tmp/ft7-demo-results',
  use: {
    baseURL: 'http://127.0.0.1:4240',
    viewport: { width: 1920, height: 1080 },
    acceptDownloads: true,
    launchOptions: chromiumLaunchOptions(),
    trace: 'off',
  },
  webServer: [
    {
      command: 'npx vite --host 127.0.0.1 --port 4240 --strictPort',
      cwd: '../../..',
      url: 'http://127.0.0.1:4240',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
