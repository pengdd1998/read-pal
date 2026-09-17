import { defineConfig } from 'playwright/test';

// M3.3: core-chain e2e specs. Local runs against dev servers; the
// deploy.yml Phase-5 browser gate consumes this config once the staging
// stack lands in CI.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_WEB || 'http://localhost:3000',
    ignoreHTTPSErrors: true,
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
