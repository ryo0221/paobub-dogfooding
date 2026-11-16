import { defineConfig, devices } from '@playwright/test';
import { defaults, suites } from './tests/playwright/suites';

const base = suites['construction.playground']();
export default defineConfig({
  ...defaults,
  ...base,
  testDir: './tests/demo/sky',
  testMatch: /tt5\.demo\.ts$/,
  reporter: 'list',
  timeout: 120 * 60_000,
  outputDir: '/tmp/claude-0/tt5-demo-out',
  expect: { ...defaults.expect, ...base.expect },
  use: { ...defaults.use, ...base.use },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: process.env.CLIPS ? { width: 1920, height: 1080 } : { width: 1440, height: 900 },
        video: { mode: 'on', size: process.env.CLIPS ? { width: 1920, height: 1080 } : { width: 1440, height: 900 } },
      },
    },
  ],
});
