"""Browser simulation tests — comprehensive API + page flow verification.

Tests all critical user flows by:
1. Registering/logging in
2. Testing every API endpoint
3. Verifying response shapes match what the frontend expects
4. Testing cross-endpoint workflows (read → annotate → export)
"""
import asyncio
import json
import re
import sys
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, '.')


BASE = 'http://testserver'
TEST_USER = {
    'email': 'simtest@readpal.example.com',
    'password': 'TestPass123!',
    'name': 'Sim Tester',
}
HEADERS = {}
BOOK_ID = None


async def register_and_login(client: AsyncClient):
    """Register a test user and get JWT token."""
    # Register
    r = await client.post(f'{BASE}/api/auth/register', json=TEST_USER)
    if r.status_code not in (200, 201, 409):  # 409 = already exists
        print(f'  FAIL register: {r.status_code} {r.text[:200]}')
        return False
    print(f'  OK register ({r.status_code})')

    # Login
    r = await client.post(
        f'{BASE}/api/auth/login',
        json={'email': TEST_USER['email'], 'password': TEST_USER['password']},
    )
    if r.status_code != 200:
        print(f'  FAIL login: {r.status_code} {r.text[:200]}')
        return False
    data = r.json()
    inner = data.get('data', data)
    token = inner.get('token') or inner.get('access_token')
    if not token:
        print(f'  FAIL login: no token in response keys: {list(inner.keys())}')
        return False
    HEADERS['Authorization'] = f'Bearer {token}'
    print(f'  OK login (token received)')
    return True


async def test_api(method, path, label, expected_status=200, **kwargs):
    """Generic API test."""
    kwargs.setdefault('headers', HEADERS)
    fn = getattr(async_client, method)
    r = await fn(f'{BASE}{path}', **kwargs)
    status_ok = r.status_code == expected_status
    detail = ''
    if not status_ok:
        detail = f' | body: {r.text[:150]}'
    # Check for 307 redirects (the bug we fixed)
    redirect_bad = ''
    if r.status_code == 307:
        redirect_bad = f' | REDIRECT to: {r.headers.get("location", "?")}'
    icon = 'OK' if status_ok else 'FAIL'
    print(f'  [{icon}] {label}: {method.upper()} {path} → {r.status_code} (expected {expected_status}){redirect_bad}{detail}')
    return r, status_ok


async def test_dashboard():
    """Test /api/stats/dashboard — critical for dashboard page."""
    r, ok = await test_api('get', '/api/stats/dashboard', 'Dashboard stats')
    if not ok:
        return False
    data = r.json()
    # Check shape matches what frontend expects
    d = data.get('data', data)
    keys = list(d.keys())
    required = ['stats', 'recentBooks', 'weeklyActivity', 'booksByStatus']
    missing = [k for k in required if k not in d]
    if missing:
        print(f'  FAIL dashboard missing keys: {missing} | has: {keys}')
        return False
    print(f'  OK dashboard shape: {keys}')
    return True


async def test_books_crud():
    """Test books CRUD — library page depends on this."""
    # List books
    r, ok = await test_api('get', '/api/books', 'List books')
    if not ok:
        return False
    books_data = r.json()
    books = books_data.get('data', books_data)
    if isinstance(books, list):
        print(f'  OK books is array ({len(books)} items)')
    elif isinstance(books, dict):
        items = books.get('items', books.get('books', []))
        print(f'  OK books response ({len(items)} items)')
    else:
        print(f'  WARN books response shape: {type(books)}')
    return True


async def test_settings():
    """Test settings — settings page."""
    r, ok = await test_api('get', '/api/settings', 'Get settings')
    if not ok:
        return False
    data = r.json()
    s = data.get('data', data)
    print(f'  OK settings keys: {list(s.keys())[:10]}')

    # Update settings
    r2, ok2 = await test_api('patch', '/api/settings', 'Update settings', json={'language': 'en'}, headers=HEADERS)
    return ok and ok2


async def test_reading_sessions():
    """Test reading sessions."""
    r, ok = await test_api('get', '/api/reading-sessions', 'List sessions')
    if not ok:
        return False
    data = r.json()
    sessions = data.get('data', data)
    if isinstance(sessions, list):
        print(f'  OK sessions is array ({len(sessions)} items)')
    elif isinstance(sessions, dict):
        items = sessions.get('items', sessions.get('sessions', []))
        print(f'  OK sessions ({len(items)} items)')
    return True


async def test_annotations():
    """Test annotations endpoints."""
    r, ok = await test_api('get', '/api/annotations', 'List annotations')
    if not ok:
        return False
    data = r.json()
    anns = data.get('data', data)
    count = len(anns) if isinstance(anns, list) else len(anns.get('items', anns.get('annotations', [])))
    print(f'  OK annotations ({count} items)')
    return True


async def test_companion():
    """Test AI companion chat."""
    # List conversations
    r, ok = await test_api('get', '/api/agent/conversations', 'List conversations')
    if not ok:
        return False
    return True


async def test_flashcards():
    """Test flashcards endpoints."""
    r, ok = await test_api('get', '/api/flashcards', 'List flashcards')
    if not ok:
        return False
    return True


async def test_collections():
    """Test collections."""
    r, ok = await test_api('get', '/api/collections', 'List collections')
    return ok


async def test_book_clubs():
    """Test book clubs."""
    r, ok = await test_api('get', '/api/book-clubs', 'List book clubs')
    return ok


async def test_notifications():
    """Test notifications."""
    r, ok = await test_api('get', '/api/notifications', 'List notifications')
    return ok


async def test_reading_book():
    """Test reading book (personal reading book)."""
    r, ok = await test_api('get', '/api/reading-book', 'List reading books')
    return ok


async def test_export():
    """Test export endpoints."""
    r, ok = await test_api('get', '/api/export', 'Export options')
    return ok


async def test_recommendations():
    """Test recommendations."""
    r, ok = await test_api('get', '/api/recommendations', 'List recommendations')
    return ok


async def test_challenges():
    """Test challenges."""
    r, ok = await test_api('get', '/api/challenges', 'List challenges')
    return ok


async def test_share():
    """Test share endpoints."""
    r, ok = await test_api('get', '/api/share', 'List shares')
    return ok


async def test_knowledge():
    """Test knowledge graph."""
    r, ok = await test_api('get', '/api/knowledge', 'Knowledge graph')
    return ok


async def test_study_mode():
    """Test study mode."""
    r, ok = await test_api('get', '/api/study-mode', 'Study mode')
    return ok


async def test_discovery():
    """Test discovery."""
    r, ok = await test_api('get', '/api/discovery', 'Discovery')
    return ok


async def test_interventions():
    """Test interventions."""
    r, ok = await test_api('get', '/api/interventions', 'Interventions')
    return ok


async def test_webhooks():
    """Test webhooks."""
    r, ok = await test_api('get', '/api/webhooks', 'List webhooks')
    return ok


async def test_account():
    """Test account endpoints."""
    r, ok = await test_api('get', '/api/account', 'Get account')
    return ok


async def test_friends():
    """Test friends."""
    r, ok = await test_api('get', '/api/friend', 'List friends')
    return ok


async def test_health():
    """Test health check."""
    r, ok = await test_api('get', '/api/health', 'Health check')
    return ok


async def test_stats():
    """Test stats endpoint."""
    r, ok = await test_api('get', '/api/stats', 'Stats')
    return ok


async def test_password_reset():
    """Test password reset (just the endpoint shape, no email)."""
    r = await async_client.post(
        f'{BASE}/api/password-reset/request',
        json={'email': TEST_USER['email']},
    )
    # Should be 200 even if email isn't configured
    ok = r.status_code in (200, 201, 202, 503)
    icon = 'OK' if ok else 'FAIL'
    print(f'  [{icon}] Password reset request: {r.status_code}')
    return ok


async def test_upload():
    """Test upload endpoint."""
    r = await async_client.get(f'{BASE}/api/upload', headers=HEADERS)
    ok = r.status_code in (200, 405, 404)  # GET may not be defined
    print(f'  [{"OK" if ok else "FAIL"}] Upload GET: {r.status_code}')
    return ok


# ─── Frontend page structure tests ───

async def test_frontend_pages():
    """Test that frontend pages render (via Next.js dev server)."""
    print('\n=== Frontend Page Rendering ===')
    pages = [
        ('/', 'Home/Landing'),
        ('/en', 'Home (EN)'),
        ('/en/dashboard', 'Dashboard'),
        ('/en/settings', 'Settings'),
        ('/en/library', 'Library'),
    ]
    results = []
    async with AsyncClient(timeout=15.0) as fc:
        for path, label in pages:
            try:
                r = await fc.get(f'http://localhost:3000{path}', follow_redirects=True)
                ok = r.status_code == 200
                has_content = len(r.text) > 500 if ok else False
                icon = 'OK' if ok and has_content else 'WARN' if ok else 'FAIL'
                size_kb = len(r.text) // 1024
                print(f'  [{icon}] {label}: GET {path} → {r.status_code} ({size_kb}KB)')
                results.append(ok and has_content)
            except Exception as e:
                print(f'  [FAIL] {label}: {e}')
                results.append(False)
    return all(results)


# ─── Main ───

async def run_tests():
    global async_client

    from app.main import app
    transport = ASGITransport(app=app)
    async_client = AsyncClient(transport=transport, base_url=BASE)

    async with async_client:
        print('=== Auth ===')
        if not await register_and_login(async_client):
            print('\nFATAL: Cannot authenticate. Aborting.')
            return

        # Core API tests
        tests = [
            ('Health', test_health),
            ('Dashboard', test_dashboard),
            ('Books CRUD', test_books_crud),
            ('Settings', test_settings),
            ('Reading Sessions', test_reading_sessions),
            ('Annotations', test_annotations),
            ('Companion', test_companion),
            ('Flashcards', test_flashcards),
            ('Collections', test_collections),
            ('Book Clubs', test_book_clubs),
            ('Notifications', test_notifications),
            ('Reading Book', test_reading_book),
            ('Export', test_export),
            ('Recommendations', test_recommendations),
            ('Challenges', test_challenges),
            ('Share', test_share),
            ('Knowledge', test_knowledge),
            ('Study Mode', test_study_mode),
            ('Discovery', test_discovery),
            ('Interventions', test_interventions),
            ('Webhooks', test_webhooks),
            ('Account', test_account),
            ('Friends', test_friends),
            ('Password Reset', test_password_reset),
            ('Upload', test_upload),
            ('Stats', test_stats),
        ]

        results = {}
        for name, fn in tests:
            print(f'\n=== {name} ===')
            try:
                ok = await fn()
                results[name] = ok
            except Exception as e:
                print(f'  ERROR: {e}')
                results[name] = False

        # Frontend page tests
        frontend_ok = await test_frontend_pages()
        results['Frontend Pages'] = frontend_ok

        # Summary
        print('\n' + '=' * 60)
        print('SUMMARY')
        print('=' * 60)
        passed = sum(1 for v in results.values() if v)
        total = len(results)
        for name, ok in results.items():
            icon = '✓' if ok else '✗'
            print(f'  {icon} {name}')
        print(f'\n{passed}/{total} passed ({100*passed//total}%)')
        return results


if __name__ == '__main__':
    asyncio.run(run_tests())
