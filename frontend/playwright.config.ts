import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build served by `vite preview` (proxying /api to the Python server on :8766, started without users for tests).
export default defineConfig({
  // one worker: every spec shares the single no-login workspace on the test API, so files must not reset it under each other
  testDir: 'e2e', timeout: 60_000, expect: { timeout: 15_000 }, fullyParallel: false, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.PW_CHANNEL ?? 'chrome', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'iphone-pro-max', use: { ...devices['iPhone 14 Pro Max'], browserName: 'chromium', channel: process.env.PW_CHANNEL ?? 'chrome' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
