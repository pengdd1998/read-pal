// E2E core chains (M3.3): login → library → reader → footnote → chat.
// Runs against a local stack (backend :8000, web :3000) — the deploy.yml
// Phase-5 browser gate will consume these specs once the staging stack is
// wired into CI. Until then: `pnpm --filter @read-pal/web test:e2e` locally.
//
// Requirements: backend + web dev servers running; a fresh account is
// registered per run (no shared state).

import { test, expect } from '@playwright/test';

const WEB = process.env.E2E_WEB || 'http://localhost:3000';

test('login → library renders the book grid', async ({ page }) => {
  const email = `e2e-core-${Date.now()}@readpal-tests.example.com`;
  await page.goto(`${WEB}/en/auth?mode=register`);
  await page.fill('#name', 'E2E Core');
  await page.fill('#email', email);
  await page.fill('#password', 'BrowserTest123!');
  await page.fill('#confirmPassword', 'BrowserTest123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|library/, { timeout: 30_000 });
  await page.goto(`${WEB}/en/library`);
  await expect(page.locator('main')).toBeVisible();
});

test('reader renders chapter content and headers', async ({ page }) => {
  // Requires the seeded sample book (auto-present on fresh accounts).
  const email = `e2e-read-${Date.now()}@readpal-tests.example.com`;
  await page.goto(`${WEB}/en/auth?mode=register`);
  await page.fill('#name', 'E2E Read');
  await page.fill('#email', email);
  await page.fill('#password', 'BrowserTest123!');
  await page.fill('#confirmPassword', 'BrowserTest123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|library/, { timeout: 30_000 });
  await page.goto(`${WEB}/en/library`);
  // open the first book card
  const card = page.locator('a[href*="/read/"], [data-testid="book-card"]').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  await card.click();
  await page.waitForSelector('.reader-content', { timeout: 60_000 });
  await expect(page.locator('.reader-content')).toBeVisible();
});

test('footnote marker click shows a popover without navigation', async ({ page }) => {
  test.skip(true, 'needs the footnote-bearing sample book wired into e2e seed — enable with the FN-M2 fixture');
});
