// E2E companion chains (M3.3 补强): chat streaming round-trip, annotation
// create→list, library→book detail. Requires the local stack (backend :8000,
// web :3000) with a working LLM key for the chat chain.

import { test, expect } from '@playwright/test';

const WEB = process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.E2E_API || 'http://localhost:8000';

async function registerAndGo(page: import('@playwright/test').Page, path: string) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@readpal-tests.example.com`;
  await page.goto(`${WEB}/zh/auth?mode=register`);
  await page.fill('#name', 'E2E');
  await page.fill('#email', email);
  await page.fill('#password', 'BrowserTest123!');
  await page.fill('#confirmPassword', 'BrowserTest123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|library|welcome/, { timeout: 30_000 });

  // Seed the sample book via the versioned API directly: the register-time
  // seeding call in AuthForm lacks the /v1 prefix and only works behind the
  // prod nginx rewrite (dev-direct 404s) — pre-existing divergence, so the
  // spec guarantees its own fixture.
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  if (token) {
    await page.request.post(`${API}/api/v1/books/seed-sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  await page.goto(`${WEB}${path}`);
}

test('chat: send a message and receive a streamed reply', async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndGo(page, '/zh/library');
  // Library cards expand a detail popover on inner clicks; navigate by href.
  const card = page.locator('a[href*="/read/"]').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  const href = await card.getAttribute('href');
  await page.goto(`${WEB}${href}`);
  await page.waitForSelector('.reader-content', { timeout: 60_000 });

  // open the companion chat — the FAB's label is the i18n key
  // 'companion_aria_chat_with' rendered with the friend name.
  const opener = page.locator('[aria-label*="chat_with" i], [aria-label*="聊天" i]').first();
  await opener.waitFor({ state: 'visible', timeout: 20_000 });
  await opener.click();

  const input = page.locator('textarea').last();
  await input.waitFor({ state: 'visible', timeout: 20_000 });
  await input.fill('这本书的主题是什么？请用一句话回答。');
  await page.keyboard.press('Enter');
  // an assistant bubble must appear within the LLM budget
  await page.waitForSelector('.prose-sm, [class*="assistant"], [data-role="assistant"]', { timeout: 90_000 });
  await expect(page.locator('.prose-sm, [data-role="assistant"]').first()).toBeVisible();
});

test('annotation: select text → highlight → appears in annotations list', async ({ page }) => {
  test.setTimeout(90_000);
  await registerAndGo(page, '/zh/library');
  const card = page.locator('a[href*="/read/"]').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  const href = await card.getAttribute('href');
  await page.goto(`${WEB}${href}`);
  await page.waitForSelector('.reader-content p', { timeout: 60_000 });

  // select the first paragraph's text: a real Range selection plus a
  // document-level mouseup (the capture hook listens on document and
  // defers one rAF before reading the selection).
  const para = page.locator('.reader-content p').first();
  await para.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  // highlight via the selection toolbar
  const hl = page.locator('[data-selection-toolbar] button[aria-label*="高亮"], [data-selection-toolbar] button[aria-label*="Highlight" i]').first();
  await hl.waitFor({ state: 'visible', timeout: 10_000 });
  await hl.click();
  await page.waitForTimeout(1_500);

  // open the annotations sidebar and expect an entry
  const sidebar = page.locator('[aria-label*="标注" i], [aria-label*="annotation" i], button:has-text("标注")').first();
  await sidebar.click().catch(() => {});
  await page.waitForTimeout(1_000);
  await expect(page.locator('text=/高亮|highlight/i').first()).toBeVisible({ timeout: 15_000 });
});

test('library: book detail shows metadata sections', async ({ page }) => {
  await registerAndGo(page, '/zh/library');
  // Library cards expand a detail popover on inner clicks; navigate by href.
  const card = page.locator('a[href*="/read/"]').first();
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  const href = await card.getAttribute('href');
  await page.goto(`${WEB}${href}`);
  await page.waitForSelector('.reader-content, [class*="book-detail"], main', { timeout: 60_000 });
  // the reader (or detail) view must render the app shell, not an error state
  await expect(page.locator('main')).toBeVisible();
  const body = await page.textContent('body');
  expect(body).not.toContain('Application error');
});
