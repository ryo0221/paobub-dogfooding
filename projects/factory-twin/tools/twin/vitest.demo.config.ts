import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/demo/factory/**/*.test.ts'], testTimeout: 1_800_000 },
});
