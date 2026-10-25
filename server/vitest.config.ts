import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', MH_SIM_URL: 'http://localhost:4199/mh-sim' },
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
