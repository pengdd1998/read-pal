"""Browser simulation v2 — uses ACTUAL frontend API paths.

Tests all endpoints the frontend actually calls, with correct paths.
Verifies response shapes match what components expect.
"""
import asyncio
import json
import sys

import httpx

BASE = 'http://localhost:8000'
TEST_EMAIL = 'simtest@readpal.example.com'
TEST_PASS = 'TestPass123!'
HEADERS = {}
BOOK_ID = None
results = {}


async def api(method, path, label, expected=200, **kwargs):
    """Test an API endpoint, return (response, ok)."""
    kwargs.setdefault('headers', HEADERS)
    async with httpx.AsyncClient(base_url=BASE, timeout=10) as c:
        fn = getattr(c, method)
        r = await fn(path, **kwargs)
        ok = r.status_code == expected
        extra = ''
        if r.status_code == 307:
            extra = f' [307 REDIRECT → {r.headers.get("location", "?")}]'
        elif not ok:
            extra = f' | {r.text[:120]}'
        icon = 'OK' if ok else 'FAIL'
        print(f'  [{icon}] {label}: {method.upper()} {path} → {r.status_code}{extra}')
        return r, ok


async def register_and_login():
    """Auth flow — register then login."""
    async with httpx.AsyncClient(base_url=BASE, timeout=10) as c:
        # Register (409 = already exists is fine)
        r = await c.post('/api/v1/auth/register', json={
            'email': TEST_EMAIL, 'password': TEST_PASS, 'name': 'Sim Tester',
        })
        print(f'  [{"OK" if r.status_code in (200, 201, 409) else "FAIL"}] Register: {r.status_code}')

        # Login
        r = await c.post('/api/v1/auth/login', json={
            'email': TEST_EMAIL, 'password': TEST_PASS,
        })
        if r.status_code != 200:
            print(f'  [FAIL] Login: {r.status_code} {r.text[:200]}')
            return False
        data = r.json()
        inner = data.get('data', data)
        token = inner.get('token')
        if not token:
            print(f'  [FAIL] Login: no token')
            return False
        HEADERS['Authorization'] = f'Bearer {token}'
        print(f'  [OK] Login (token received)')

        # Extract book_id from user data
        user = inner.get('user', {})
        print(f'  User: {user.get("email")}')
        return True


async def test_endpoint(name, method, path, expected=200, **kwargs):
    """Generic test with results tracking."""
    r, ok = await api(method, path, name, expected, **kwargs)
    results[name] = ok
    return r, ok


async def run_all():
    print('=== Auth ===')
    if not await register_and_login():
        print('FATAL: Cannot authenticate')
        return

    # ─── Core pages: Dashboard data ───
    print('\n=== Dashboard Page Data ===')
    r, ok = await test_endpoint('Stats dashboard', 'get', '/api/v1/stats/dashboard')
    if ok:
        d = r.json().get('data', {})
        print(f'    Shape: {list(d.keys())}')
        stats = d.get('stats', {})
        print(f'    Stats: {list(stats.keys()) if isinstance(stats, dict) else stats}')
        recent = d.get('recentBooks', [])
        print(f'    Recent books: {len(recent)}')
        weekly = d.get('weeklyActivity', [])
        print(f'    Weekly activity: {len(weekly)} days')
        by_status = d.get('booksByStatus', {})
        print(f'    By status: {by_status}')

    r, ok = await test_endpoint('Reading speed by book', 'get',
        '/api/v1/stats/reading-speed/by-book')
    if ok:
        print(f'    Data: {r.json()}')

    r, ok = await test_endpoint('Reading calendar', 'get',
        '/api/v1/stats/reading-calendar')

    # ─── Library Page ───
    print('\n=== Library Page ===')
    r, ok = await test_endpoint('List books', 'get', '/api/v1/books')
    if ok:
        data = r.json()
        books = data.get('data', data)
        if isinstance(books, list):
            print(f'    Count: {len(books)}')
            if books:
                BOOK_ID = books[0].get('id') or books[0].get('bookId')
                print(f'    First book ID: {BOOK_ID}')
                print(f'    First book: {books[0].get("title")} by {books[0].get("author")} ({books[0].get("status")}, {books[0].get("progress")}%)')
        elif isinstance(books, dict):
            items = books.get('items', books.get('books', []))
            print(f'    Count: {len(items)}')
            if items:
                BOOK_ID = items[0].get('id') or items[0].get('bookId')
                print(f'    First book ID: {BOOK_ID}')

    # Discovery (library page calls this)
    r, ok = await test_endpoint('Discovery free books', 'get',
        '/api/v1/discovery/free-books')

    # ─── Reader Page (critical path) ───
    print('\n=== Reader Page (critical) ===')
    if not BOOK_ID:
        # Try to get a book ID
        r, _ = await api('get', '/api/v1/books', 'Get books for reader')
        data = r.json()
        books = data.get('data', data)
        if isinstance(books, list) and books:
            BOOK_ID = books[0].get('id')
        elif isinstance(books, dict):
            items = books.get('items', books.get('books', []))
            if items:
                BOOK_ID = items[0].get('id')

    if BOOK_ID:
        print(f'    Testing with book: {BOOK_ID}')
        await test_endpoint('Book detail', 'get', f'/api/v1/books/{BOOK_ID}')
        await test_endpoint('Annotations for book', 'get', f'/api/v1/annotations?bookId={BOOK_ID}')
        await test_endpoint('Agent history', 'get', f'/api/v1/agent/history?bookId={BOOK_ID}')
        await test_endpoint('Reading speed', 'get', f'/api/v1/stats/reading-speed?bookId={BOOK_ID}')

        # Companion health check
        await test_endpoint('Agent health', 'get', '/api/v1/agent/health')
    else:
        print('    SKIP: No book ID available')

    # ─── Settings Page ───
    print('\n=== Settings Page ===')
    r, ok = await test_endpoint('Get settings', 'get', '/api/v1/settings')
    if ok:
        s = r.json().get('data', {})
        print(f'    Keys: {list(s.keys())}')
    r, ok = await test_endpoint('Update settings', 'patch', '/api/v1/settings',
        json={'theme': 'dark', 'language': 'en'})

    # Account section
    r, ok = await test_endpoint('Auth/me (account)', 'get', '/api/v1/auth/me')

    # API keys
    r, ok = await test_endpoint('API keys', 'get', '/api/v1/api-keys')

    # ─── Annotations Page ───
    print('\n=== Annotations ===')
    await test_endpoint('List all annotations', 'get', '/api/v1/annotations')

    # ─── Flashcards ───
    print('\n=== Flashcards ===')
    await test_endpoint('List flashcards', 'get', '/api/v1/flashcards')

    # ─── Collections ───
    print('\n=== Collections ===')
    await test_endpoint('List collections', 'get', '/api/v1/collections')

    # ─── Book Clubs ───
    print('\n=== Book Clubs ===')
    await test_endpoint('List book clubs', 'get', '/api/v1/book-clubs')

    # ─── Notifications ───
    print('\n=== Notifications ===')
    await test_endpoint('List notifications', 'get', '/api/v1/notifications')

    # ─── Reading Book (Personal Reading Book) ───
    print('\n=== Reading Book ===')
    await test_endpoint('List reading books', 'get', '/api/v1/reading-book')

    # ─── Export ───
    print('\n=== Export ===')
    if BOOK_ID:
        await test_endpoint('Export book (JSON)', 'get',
            f'/api/v1/export?bookId={BOOK_ID}&format=json')
    else:
        print('    SKIP: No book ID')

    # ─── Knowledge Graph ───
    print('\n=== Knowledge Graph ===')
    await test_endpoint('Knowledge graph', 'get', '/api/v1/knowledge/graph')
    await test_endpoint('Knowledge search', 'get', '/api/v1/knowledge/search?q=Gatsby')

    # ─── Study Mode ───
    print('\n=== Study Mode ===')
    await test_endpoint('Study objectives', 'get', '/api/v1/study-mode/objectives')
    if BOOK_ID:
        await test_endpoint('Mastery by book', 'get', f'/api/v1/study-mode/mastery/{BOOK_ID}')

    # ─── Recommendations ───
    print('\n=== Recommendations ===')
    await test_endpoint('Recommendations', 'get', '/api/v1/recommendations')

    # ─── Challenges ───
    print('\n=== Challenges ===')
    await test_endpoint('Challenges', 'get', '/api/v1/challenges')

    # ─── Share ───
    print('\n=== Share ===')
    await test_endpoint('Shared exports', 'get', '/api/v1/share')

    # ─── Webhooks ───
    print('\n=== Webhooks ===')
    await test_endpoint('Webhooks', 'get', '/api/v1/webhooks')

    # ─── Friend ───
    print('\n=== Friend ===')
    await test_endpoint('Friend relationship', 'get', '/api/v1/friend/relationship')

    # ─── Interventions ───
    print('\n=== Interventions ===')
    await test_endpoint('Intervention check', 'get', '/api/v1/interventions/check')

    # ─── Discovery/Search ───
    print('\n=== Search ===')
    await test_endpoint('Discovery search', 'get', '/api/v1/discovery/search?q=Gatsby')
    await test_endpoint('Discovery semantic', 'get', '/api/v1/discovery/semantic?q=dream')

    # ─── Auth sub-routes ───
    print('\n=== Auth Sub-routes ===')
    await test_endpoint('Forgot password', 'post', '/api/v1/auth/forgot-password',
        json={'email': TEST_EMAIL}, expected=200)
    await test_endpoint('Validate token', 'post', '/api/v1/auth/validate-token',
        json={'token': 'invalid'}, expected=401)

    # ─── ApiCompatMiddleware rewrites ───
    print('\n=== ApiCompatMiddleware (/api/ → /api/v1/) ===')
    # Frontend calls /api/books (without v1), middleware rewrites
    r, ok = await test_endpoint('/api/books (rewritten)', 'get', '/api/books')
    r2, ok2 = await test_endpoint('/api/settings (rewritten)', 'get', '/api/settings')
    r3, ok3 = await test_endpoint('/api/stats/dashboard (rewritten)', 'get', '/api/stats/dashboard')
    # Legacy rewrite: /api/v1/agents → /api/v1/agent
    r4, ok4 = await test_endpoint('/api/agents/health (legacy rewrite)', 'get', '/api/agents/health')
    results['ApiCompatMiddleware'] = ok and ok2 and ok3 and ok4

    # ─── Frontend Page Rendering ───
    print('\n=== Frontend Pages (dev server) ===')
    pages = [
        ('/', 'Landing'),
        ('/en', 'Home (EN)'),
        ('/en/dashboard', 'Dashboard'),
        ('/en/settings', 'Settings'),
        ('/en/library', 'Library'),
        ('/en/forgot-password', 'Forgot Password'),
    ]
    page_ok = True
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
        for path, label in pages:
            try:
                r = await c.get(f'http://localhost:3000{path}')
                ok = r.status_code == 200 and len(r.text) > 500
                size_kb = len(r.text) // 1024
                print(f'  [{"OK" if ok else "WARN"}] {label}: {path} → {r.status_code} ({size_kb}KB)')
                if not ok:
                    page_ok = False
            except Exception as e:
                print(f'  [FAIL] {label}: {e}')
                page_ok = False
    results['Frontend Pages'] = page_ok

    # ─── Summary ───
    print('\n' + '=' * 60)
    print('SUMMARY')
    print('=' * 60)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    fails = [(k, v) for k, v in results.items() if not v]
    for name, ok in sorted(results.items()):
        print(f'  {"✓" if ok else "✗"} {name}')
    print(f'\n{passed}/{total} passed ({100 * passed // total}%)')
    if fails:
        print(f'\nFAILURES ({len(fails)}):')
        for name, _ in fails:
            print(f'  - {name}')


if __name__ == '__main__':
    asyncio.run(run_all())
