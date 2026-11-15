import { defineConfig, devices } from '@playwright/test';
import { defaults, suites } from './tests/playwright/suites';

const base = suites['character.playground']();
export default defineConfig({
  ...defaults,
  ...base,
  testDir: './tests/demo',
  testMatch: new RegExp(process.env.DEMO_MATCH ?? 'gudaguda-ep01-stage\\.demo\\.ts$'),
  reporter: 'list',
  timeout: 3 * 60 * 60_000,
  outputDir: process.env.DEMO_OUT ?? '/tmp/claude-0/gudaguda-stage-out',
  expect: { ...defaults.expect, ...base.expect },
  use: { ...defaults.use, ...base.use },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, video: 'off' },
    },
  ],
});
