import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: [process.env.T ?? 'tests/demo/**/eval.test.ts'], testTimeout: 600_000, hookTimeout: 300_000 } });
