import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  reporter: [['line']],
  outputDir: '../../test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
