"""Smoke test — critical API path validation against a live backend.

Phase 5.3 (M7) of the harness-engineering rollout: closes the "unit tests
pass, app doesn't work" gap by hitting the actual API endpoints the
frontend uses, with correct paths and shapes.

Runs ONLY when ``SMOKE_TARGET`` env var is set (e.g. ``SMOKE_TARGET=http://localhost:8000``).
In default pytest runs, this test is skipped. Intended for:

- Pre-deploy gating in ``deploy.yml`` (against a staging container)
- Manual local runs before shipping
- Periodic staging validation

Replaces the loose collection of:

- ``tests/browser_simulation.py`` (deprecated — uses wrong API paths)
- ``tests/browser_simulation_v2.py`` (canonical; this file absorbs its logic)
- ``tests/playwright_simulation.js`` (deprecated — has typos, not Python)

To run::

    # Start staging backend, then:
    SMOKE_TARGET=http://localhost:8000 \
        uv run pytest tests/test_smoke_endpoints.py -v -m smoke
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest

pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(
        not os.environ.get('SMOKE_TARGET'),
        reason='requires SMOKE_TARGET env var (e.g. http://localhost:8000)',
    ),
]


@pytest.fixture
async def client():
    """Yield an httpx AsyncClient pointed at SMOKE_TARGET."""
    base = os.environ['SMOKE_TARGET'].rstrip('/')
    async with httpx.AsyncClient(base_url=base, timeout=15) as c:
        yield c


@pytest.fixture
async def auth_headers(client):
    """Register + login a unique test user, yield Authorization headers."""
    suffix = uuid.uuid4().hex[:8]
    email = f'smoke-{suffix}@readpal.example.com'
    password = 'SmokePass123!'

    # Register (409 is fine if user somehow already exists)
    r = await client.post('/api/v1/auth/register', json={
        'email': email, 'password': password, 'name': 'Smoke Tester',
    })
    assert r.status_code in (200, 201, 409), f'register failed: {r.status_code} {r.text[:200]}'

    # Login
    r = await client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text[:200]}'
    data = r.json().get('data', r.json())
    token = data.get('token')
    assert token, f'no token in response: {data}'

    return {'Authorization': f'Bearer {token}'}


async def test_health_check(client):
    """Health endpoint must return 200."""
    r = await client.get('/health')
    assert r.status_code == 200, f'health failed: {r.status_code}'


async def test_auth_flow(client, auth_headers):
    """Register + login must yield a valid bearer token."""
    assert 'Authorization' in auth_headers
    assert auth_headers['Authorization'].startswith('Bearer ')


async def test_dashboard_stats(client, auth_headers):
    """GET /api/v1/stats/dashboard must return expected shape."""
    r = await client.get('/api/v1/stats/dashboard', headers=auth_headers)
    assert r.status_code == 200, f'dashboard failed: {r.status_code} {r.text[:200]}'
    data = r.json().get('data', r.json())
    expected_keys = {'stats', 'recentBooks', 'weeklyActivity', 'booksByStatus'}
    missing = expected_keys - data.keys()
    assert not missing, f'dashboard missing keys: {missing} (got: {list(data.keys())})'


async def test_books_list(client, auth_headers):
    """GET /api/v1/books must return 200 with data array (may be empty)."""
    r = await client.get('/api/v1/books', headers=auth_headers)
    assert r.status_code == 200, f'books list failed: {r.status_code} {r.text[:200]}'
    data = r.json()
    # Response shape: either list directly, or {data: [...]}
    if isinstance(data, dict):
        assert 'data' in data, f'unexpected books shape: {list(data.keys())}'
        books = data['data']
    else:
        books = data
    assert isinstance(books, list), f'books must be a list, got {type(books)}'


async def test_reading_sessions(client, auth_headers):
    """GET /api/v1/reading-sessions must return 200."""
    r = await client.get('/api/v1/reading-sessions', headers=auth_headers)
    assert r.status_code == 200, f'reading-sessions failed: {r.status_code} {r.text[:200]}'
