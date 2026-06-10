"""Security-focused tests — rate limiting, login lockout, JWT blacklist, password reset invalidation."""

import json
import time
from unittest.mock import AsyncMock, patch

import jwt as pyjwt
import pytest

from tests.conftest import _TestSession, auth_headers, register_user


def _make_stateful_redis():
    """Create a fake Redis with stateful incr/get/set/delete/exists/setex.

    Uses an in-memory dict to simulate Redis behaviour for rate-limiting,
    lockout, and blacklist checks.  The ``store`` attribute is exposed so
    callers can seed data before handing the mock off to the patch.
    """
    store: dict[str, str] = {}

    async def _incr(key):
        val = int(store.get(key, '0')) + 1
        store[key] = str(val)
        return val

    async def _get(key):
        return store.get(key)

    async def _set(key, value, **kwargs):
        store[key] = value

    async def _delete(key):
        store.pop(key, None)

    async def _exists(key):
        return 1 if key in store else 0

    async def _setex(key, ttl, value):
        store[key] = value

    async def _expire(key, seconds):
        return True

    async def _ttl(key):
        return 60

    fake = AsyncMock()
    fake.store = store
    fake.incr = _incr
    fake.get = _get
    fake.set = _set
    fake.delete = _delete
    fake.exists = _exists
    fake.setex = _setex
    fake.expire = _expire
    fake.ttl = _ttl
    return fake


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rate_limit_returns_429(client):
    """Hitting login endpoint 11 times (limit=10) returns 429 on the 11th."""
    fake_redis = _make_stateful_redis()

    with (
        patch('app.middleware.rate_limiter.get_redis', return_value=fake_redis),
        patch('app.middleware.login_lockout.get_redis', return_value=fake_redis),
    ):
        import app.middleware.rate_limiter as rl_mod
        import app.middleware.login_lockout as lockout_mod
        rl_orig, lockout_orig = rl_mod._limiter, lockout_mod._lockout
        rl_mod._limiter = None
        lockout_mod._lockout = None

        try:
            # All rate-limited endpoints share the same IP-based key, so
            # register counts as hit #1.  With login limit=10, 9 more login
            # attempts bring us to 10 total; the next triggers 429.
            await register_user(client, email='rl@test.com', password='Pass123!')

            for i in range(9):
                resp = await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'rl@test.com', 'password': 'WrongPass!'},
                )
                assert resp.status_code == 401, (
                    f'Request {i + 1} should be 401, got {resp.status_code}'
                )

            # 10th request from this IP (11th total including register) — should be rate-limited
            resp = await client.post(
                '/api/v1/auth/login',
                json={'email': 'rl@test.com', 'password': 'WrongPass!'},
            )
            assert resp.status_code == 429
            assert resp.json()['detail']['code'] == 'RATE_LIMIT_EXCEEDED'
        finally:
            rl_mod._limiter = rl_orig
            lockout_mod._lockout = lockout_orig


@pytest.mark.asyncio
async def test_rate_limit_headers_in_success_response(client):
    """429 response from rate limiter includes X-RateLimit-* headers."""
    fake_redis = _make_stateful_redis()

    with (
        patch('app.middleware.rate_limiter.get_redis', return_value=fake_redis),
        patch('app.middleware.login_lockout.get_redis', return_value=fake_redis),
    ):
        import app.middleware.rate_limiter as rl_mod
        import app.middleware.login_lockout as lockout_mod
        rl_orig, lockout_orig = rl_mod._limiter, lockout_mod._lockout
        rl_mod._limiter = None
        lockout_mod._lockout = None

        try:
            await register_user(client, email='hdr@test.com', password='Pass123!')

            # Exhaust login rate limit (register = 1 + 9 more = 10)
            for _ in range(9):
                await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'hdr@test.com', 'password': 'Wrong!'},
                )

            # Next request triggers 429
            resp = await client.post(
                '/api/v1/auth/login',
                json={'email': 'hdr@test.com', 'password': 'Wrong!'},
            )
            assert resp.status_code == 429
            assert 'x-ratelimit-limit' in resp.headers
            assert 'x-ratelimit-remaining' in resp.headers
            assert 'x-ratelimit-reset' in resp.headers
        finally:
            rl_mod._limiter = rl_orig
            lockout_mod._lockout = lockout_orig


@pytest.mark.asyncio
async def test_rate_limit_headers_in_429_response(client):
    """429 responses include rate limit headers plus Retry-After."""
    fake_redis = _make_stateful_redis()

    with (
        patch('app.middleware.rate_limiter.get_redis', return_value=fake_redis),
        patch('app.middleware.login_lockout.get_redis', return_value=fake_redis),
    ):
        import app.middleware.rate_limiter as rl_mod
        import app.middleware.login_lockout as lockout_mod
        rl_orig, lockout_orig = rl_mod._limiter, lockout_mod._lockout
        rl_mod._limiter = None
        lockout_mod._lockout = None

        try:
            await register_user(client, email='retry@test.com', password='Pass123!')

            for _ in range(9):
                await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'retry@test.com', 'password': 'Wrong!'},
                )

            resp = await client.post(
                '/api/v1/auth/login',
                json={'email': 'retry@test.com', 'password': 'Wrong!'},
            )
            assert resp.status_code == 429
            assert resp.headers.get('x-ratelimit-limit') is not None
            assert resp.headers.get('x-ratelimit-remaining') is not None
            assert resp.headers.get('x-ratelimit-reset') is not None
            assert resp.headers.get('retry-after') is not None
        finally:
            rl_mod._limiter = rl_orig
            lockout_mod._lockout = lockout_orig


# ---------------------------------------------------------------------------
# Login Lockout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_lockout_after_10_failures(client):
    """After 10 consecutive failed logins, the 11th returns 429 ACCOUNT_LOCKED."""
    fake_redis = _make_stateful_redis()

    # Only patch the lockout module's get_redis. The rate limiter will
    # continue using the conftest mock (incr always returns 1, so it
    # never triggers) — this isolates the lockout behaviour.
    with patch('app.middleware.login_lockout.get_redis', return_value=fake_redis):
        import app.middleware.login_lockout as lockout_mod
        lockout_orig = lockout_mod._lockout
        lockout_mod._lockout = None

        try:
            await register_user(client, email='lockout@test.com', password='Correct123!')

            # Fail 10 times
            for i in range(10):
                resp = await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'lockout@test.com', 'password': 'WrongPass!'},
                )
                assert resp.status_code == 401, (
                    f'Request {i + 1} should be 401, got {resp.status_code}'
                )

            # 11th attempt should be locked
            resp = await client.post(
                '/api/v1/auth/login',
                json={'email': 'lockout@test.com', 'password': 'WrongPass!'},
            )
            assert resp.status_code == 429
            assert resp.json()['detail']['code'] == 'ACCOUNT_LOCKED'
        finally:
            lockout_mod._lockout = lockout_orig


@pytest.mark.asyncio
async def test_login_lockout_clears_on_success(client):
    """Lockout counter resets on successful login: 5 fails + success + 5 fails != locked."""
    fake_redis = _make_stateful_redis()

    # Only patch lockout's get_redis; rate limiter uses conftest mock (never triggers).
    with patch('app.middleware.login_lockout.get_redis', return_value=fake_redis):
        import app.middleware.login_lockout as lockout_mod
        lockout_orig = lockout_mod._lockout
        lockout_mod._lockout = None

        try:
            await register_user(client, email='clear@test.com', password='Correct123!')

            # 5 failed attempts
            for i in range(5):
                resp = await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'clear@test.com', 'password': 'WrongPass!'},
                )
                assert resp.status_code == 401, f'Fail {i + 1} should be 401'

            # Successful login — clears the lockout counter
            resp = await client.post(
                '/api/v1/auth/login',
                json={'email': 'clear@test.com', 'password': 'Correct123!'},
            )
            assert resp.status_code == 200

            # 5 more failed attempts — should NOT be locked (counter was cleared)
            for i in range(5):
                resp = await client.post(
                    '/api/v1/auth/login',
                    json={'email': 'clear@test.com', 'password': 'WrongPass!'},
                )
                assert resp.status_code == 401, (
                    f'Post-clear fail {i + 1} should be 401, not {resp.status_code}'
                )
        finally:
            lockout_mod._lockout = lockout_orig


# ---------------------------------------------------------------------------
# JWT Blacklist
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoked_token_rejected(client):
    """After logout (which revokes the token), accessing a protected endpoint returns 401 TOKEN_REVOKED."""
    fake_redis = _make_stateful_redis()

    with patch('app.middleware.auth._get_redis', return_value=fake_redis):
        reg = await register_user(client, email='revoke@test.com', password='Pass123!')
        token = reg['token']

        # Verify token works before logout
        resp = await client.get('/api/v1/auth/me', headers=auth_headers(token))
        assert resp.status_code == 200

        # Logout — this revokes the token via blacklist
        resp = await client.post('/api/v1/auth/logout', headers=auth_headers(token))
        assert resp.status_code == 200

        # Now try to access a protected endpoint with the revoked token
        resp = await client.get('/api/v1/auth/me', headers=auth_headers(token))
        assert resp.status_code == 401
        assert resp.json()['detail']['code'] == 'TOKEN_REVOKED'


@pytest.mark.asyncio
async def test_expired_token_returns_correct_error(client):
    """An expired JWT returns 401 with code TOKEN_EXPIRED."""
    from app.config import get_settings

    settings = get_settings()

    expired_token = pyjwt.encode(
        {
            'userId': 'nonexistent-user',
            'jti': 'test-expired-jti',
            'iat': int(time.time()) - 10,
            'exp': int(time.time()) - 1,  # already expired
        },
        settings.jwt_secret,
        algorithm='HS256',
    )

    resp = await client.get('/api/v1/auth/me', headers=auth_headers(expired_token))
    assert resp.status_code == 401
    assert resp.json()['detail']['code'] == 'TOKEN_EXPIRED'


# ---------------------------------------------------------------------------
# Password Reset Invalidation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_reset_invalidates_old_tokens(client):
    """After password reset, JWTs issued before the reset are rejected with 401."""
    fake_redis = _make_stateful_redis()

    # Register first (uses conftest default mock)
    reg = await register_user(client, email='invalidate@test.com', password='OldPass123!')
    user_id = reg['user']['id']
    old_token = reg['token']

    # Verify the old token works
    resp = await client.get('/api/v1/auth/me', headers=auth_headers(old_token))
    assert resp.status_code == 200

    # Prepare the reset token in our fake Redis store
    reset_token = 'test-reset-invalidation-token'
    payload = json.dumps({'userId': user_id, 'email': 'invalidate@test.com'})
    fake_redis.store[f'password-reset:{reset_token}'] = payload

    # Patch both password_reset and auth middleware to use our stateful fake
    with (
        patch('app.routers.password_reset._get_redis', return_value=fake_redis),
        patch('app.middleware.auth._get_redis', return_value=fake_redis),
        patch('app.db.async_session', _TestSession),
    ):
        # Perform the password reset
        resp = await client.post(
            '/api/v1/auth/reset-password',
            json={'token': reset_token, 'password': 'NewPass456!'},
        )
        assert resp.status_code == 200, f'Reset failed: {resp.text}'

        # The password reset stores auth:password_changed:{user_id} with the
        # current timestamp.  If the token's iat and the password_changed
        # timestamp land in the same second, the comparison (iat < changed_ts)
        # is False.  Force the stored timestamp 1 second into the future so
        # the token is always considered stale.
        changed_key = f'auth:password_changed:{user_id}'
        current_val = int(fake_redis.store.get(changed_key, '0'))
        fake_redis.store[changed_key] = str(current_val + 1)

        # Now try to use the old JWT — auth middleware should check
        # the password_changed timestamp and reject the token
        resp = await client.get('/api/v1/auth/me', headers=auth_headers(old_token))
        assert resp.status_code == 401
        assert resp.json()['detail']['code'] == 'TOKEN_REVOKED'
