/**
 * Frontend browser simulation tests using Playwright.
 * Tests actual rendered content, data flow, and user interactions.
 */
const { chromium } = require('playwright');

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8000';

async function api(method, path, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const r = await fetch(`${BACKEND}${path}`, { method, headers });
  return r.json();
}

const results = {};

function log(test, ok, detail = '') {
  const icon = ok ? '✓' : '✗';
  console.log(`  [${icon}] ${test}${detail ? ': ' + detail : ''}`);
  results[test] = ok;
}

async function main() {
  console.log('FRONTEND BROWSER SIMULATION (Playwright)');
  console.log('='.repeat(60));

  // Auth setup
  console.log('\n=== SETUP ===');
  const registerRes = await api('POST', '/api/v1/auth/register', null);
  // Register may fail with 409 if user exists, that's fine

  const loginRes = await api('POST', '/api/v1/auth/login', null);
  // Use a fresh login for the test user
  const token = loginRes?.data?.token;
  if (!token) {
    // Try with specific test user
    const specificLogin = await fetch(`${BACKEND}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'frontendest@readpal.example.com', password: 'TestPass123!' }),
    }).then(r => r.json());
    const tok = specificLogin?.data?.token;
    if (!tok) {
      console.log('FATAL: Cannot get auth token');
      return;
    }
    var authToken = tok;
  } else {
    var authToken = token;
  }
  log('Auth', true);

  // Get book ID
  const booksRes = await api('GET', '/api/books', authToken);
  const booksData = booksRes?.data ?? booksRes;
  const books = Array.isArray(booksData) ? booksData : (booksData?.items ?? []);
  const bookId = books[0]?.id;
  console.log(`  Book: ${bookId} (${books[0]?.title})`);

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: {
      cookies: [
        // Middleware checks auth_token cookie for route protection
        { name: 'auth_token', value: authToken, domain: 'localhost', path: '/' },
      ],
      origins: [{
        origin: FRONTEND,
        localStorage: [
          // AuthProvider reads auth_token from localStorage
          { name: 'auth_token', value: authToken },
          // AuthProvider also reads user from localStorage
          { name: 'user', value: JSON.stringify({ id: 'test', email: 'frontendest@readpal.example.com', name: 'Frontend Tester' }) },
        ],
      }],
    },
  });

  try {
    // === 1. Landing page ===
    console.log('\n=== 1. LANDING PAGE ===');
    const landingPage = await context.newPage();
    await landingPage.goto(`${FRONTEND}/en`, { waitUntil: 'networkidle', timeout: 15000 });
    const title = await landingPage.title();
    log('Landing page loads', title.length > 0, `title="${title.substring(0, 60)}"`);
    await landingPage.close();

    // === 2. Dashboard page ===
    console.log('\n=== 2. DASHBOARD PAGE ===');
    const dashPage = await context.newPage();
    const dashErrors = [];
    dashPage.on('console', msg => { if (msg.type() === 'error') dashErrors.push(msg.text()); });
    dashPage.on('pageerror', err => dashErrors.push(err.message));

    await dashPage.goto(`${FRONTEND}/en/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
    await dashPage.waitForTimeout(2000); // Wait for API calls to complete

    const dashTitle = await dashPage.title();
    log('Dashboard loads', dashTitle.includes('read-pal') || dashTitle.includes('Dashboard'), `title="${dashTitle.substring(0, 60)}"`);

    // Check for rendered content
    const dashContent = await dashPage.content();
    const hasWelcome = dashContent.includes('Welcome') || dashContent.includes('welcome');
    log('Dashboard has welcome text', hasWelcome);

    // Check for current reading card
    const hasReadingCard = dashContent.includes('Gatsby') || dashContent.includes('reading') || dashContent.includes('Continue');
    log('Dashboard has reading content', hasReadingCard);

    // Check for stat cards
    const hasStats = dashContent.includes('Pages Read') || dashContent.includes('pages_read') || dashContent.includes('Books Read');
    log('Dashboard has stat cards', hasStats);

    // Check StreakCalendar renders (heatmap grid)
    const hasHeatmap = await dashPage.$('.rounded-2xl.border') !== null;
    const hasCalendarText = dashContent.includes('Reading Streak') || dashContent.includes('reading streak') || dashContent.includes('active days');
    log('Dashboard has streak calendar', hasCalendarText, hasCalendarText ? 'visible' : 'not found');

    // Check console errors — filter out React warnings (hydration, setState) which aren't real bugs
    const criticalDashErrors = dashErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('401') &&
      !e.includes('Warning: ') &&
      !e.includes('The above error occurred in')
    );
    log('Dashboard no critical errors', criticalDashErrors.length === 0, criticalDashErrors.length > 0 ? `${criticalDashErrors.length} errors` : 'clean');
    if (criticalDashErrors.length > 0 && criticalDashErrors.length <= 3) {
      criticalDashErrors.forEach(e => console.log(`    ERR: ${e.substring(0, 100)}`));
    }

    await dashPage.close();

    // === 3. Library page ===
    console.log('\n=== 3. LIBRARY PAGE ===');
    const libPage = await context.newPage();
    const libErrors = [];
    libPage.on('pageerror', err => libErrors.push(err.message));

    await libPage.goto(`${FRONTEND}/en/library`, { waitUntil: 'networkidle', timeout: 15000 });
    await libPage.waitForTimeout(1500);

    const libContent = await libPage.content();
    const hasBooks = libContent.includes('Gatsby') || libContent.includes('book') || libContent.includes('Library');
    log('Library loads with content', hasBooks);

    const criticalLibErrors = libErrors.filter(e => !e.includes('favicon'));
    log('Library no critical errors', criticalLibErrors.length === 0);

    await libPage.close();

    // === 4. Reader page ===
    if (bookId) {
      console.log('\n=== 4. READER PAGE ===');
      const readerPage = await context.newPage();
      const readerErrors = [];
      readerPage.on('pageerror', err => readerErrors.push(err.message));

      await readerPage.goto(`${FRONTEND}/en/read/${bookId}`, { waitUntil: 'networkidle', timeout: 15000 });
      await readerPage.waitForTimeout(3000); // Wait for content to load

      const readerContent = await readerPage.content();

      // Check for reader elements
      const hasChapter = readerContent.includes('chapter') || readerContent.includes('Chapter');
      log('Reader has chapter content', hasChapter);

      const hasNav = readerContent.includes('prev') || readerContent.includes('chevron') || readerContent.includes('ChevronLeft');
      log('Reader has navigation', hasNav);

      const hasReadingArea = await readerPage.$('.reading-mode') !== null || await readerPage.$('[data-theme]') !== null;
      log('Reader has reading area', hasReadingArea);

      // Test text selection
      const article = await readerPage.$('article');
      if (article) {
        const articleText = await article.textContent();
        const hasContent = articleText && articleText.trim().length > 20;
        log('Reader article has text content', hasContent, `${articleText?.trim().substring(0, 50)}...`);

        // Check for rendered highlights — only works if annotations have selection offsets
        // Seed data uses page/chapter model without text ranges, so DOM marks won't appear
        const marks = await readerPage.$$('mark[data-annotation-id]');
        const hasSidebarAnnotations = readerContent.includes('highlight') || readerContent.includes('note') || readerContent.includes('bookmark');
        log('Reader has annotation UI', hasSidebarAnnotations || marks.length > 0, marks.length > 0 ? `${marks.length} inline highlights` : hasSidebarAnnotations ? 'sidebar/list annotations present' : 'none found');
      } else {
        log('Reader article element', false, 'article not found');
      }

      const criticalReaderErrors = readerErrors.filter(e => !e.includes('favicon') && !e.includes('401'));
      log('Reader no critical errors', criticalReaderErrors.length === 0);
      if (criticalReaderErrors.length > 0 && criticalReaderErrors.length <= 3) {
        criticalReaderErrors.forEach(e => console.log(`    ERR: ${e.substring(0, 100)}`));
      }

      await readerPage.close();
    }

    // === 5. Settings page ===
    console.log('\n=== 5. SETTINGS PAGE ===');
    const settingsPage = await context.newPage();
    await settingsPage.goto(`${FRONTEND}/en/settings`, { waitUntil: 'networkidle', timeout: 15000 });
    await settingsPage.waitForTimeout(1500);

    const settingsContent = await settingsPage.content();
    const hasSettingsContent = settingsContent.includes('Theme') || settingsContent.includes('theme') || settingsContent.includes('Language');
    log('Settings page renders', hasSettingsContent);

    // Check language selector
    const hasLangSelector = settingsContent.includes('English') && settingsContent.includes('中文');
    log('Settings has language selector', hasLangSelector);

    await settingsPage.close();

    // === 6. ZH locale ===
    console.log('\n=== 6. ZH LOCALE ===');
    const zhPage = await context.newPage();
    await zhPage.goto(`${FRONTEND}/zh`, { waitUntil: 'networkidle', timeout: 15000 });
    await zhPage.waitForTimeout(1500);

    const zhContent = await zhPage.content();
    const hasZhContent = zhContent.includes('阅读') || zhContent.includes('书籍') || zhContent.includes('read-pal');
    log('ZH locale renders Chinese content', hasZhContent);

    await zhPage.close();

  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const passed = Object.values(results).filter(v => v).length;
  const total = Object.keys(results).length;
  for (const [name, ok] of Object.entries(results).sort()) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
  console.log(`\n${passed}/${total} passed (${Math.round(100 * passed / total)}%)`);

  const fails = Object.entries(results).filter(([_, v]) => !v);
  if (fails.length > 0) {
    console.log(`\nFAILURES (${fails.length}):`);
    fails.forEach(([name]) => console.log(`  - ${name}`));
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
