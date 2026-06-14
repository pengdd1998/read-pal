"""Tests for password reset endpoints — forgot-password and reset-password."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import _TestSession, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/auth/forgot-password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_password_returns_success(client):
    """Always returns success to prevent email enumeration."""
    resp = await client.post(
        '/api/v1/auth/forgot-password',
        json={'email': 'nonexistent@test.com'},
    )
    assert resp.status_code == 200
    assert resp.json()['success'] is True


@pytest.mark.asyncio
async def test_forgot_password_for_existing_user(client):
    """Returns same success response for existing user."""
    await register_user(client, email='exists@test.com')
    resp = await client.post(
        '/api/v1/auth/forgot-password',
        json={'email': 'exists@test.com'},
    )
    assert resp.status_code == 200
    assert resp.json()['success'] is True


@pytest.mark.asyncio
async def test_forgot_password_invalid_email(client):
    """Returns 422 for invalid email format."""
    resp = await client.post(
        '/api/v1/auth/forgot-password',
        json={'email': 'not-an-email'},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client):
    """Returns 400 for token not found in Redis."""
    resp = await client.post(
        '/api/v1/auth/reset-password',
        json={'token': 'invalid-token', 'password': 'NewPass123!'},
    )
    assert resp.status_code == 400
    assert resp.json()['detail']['code'] == 'INVALID_TOKEN'


@pytest.mark.asyncio
async def test_reset_password_valid_token(client):
    """Successfully resets password when token is valid."""
    reg = await register_user(client, email='reset@test.com', password='OldPass123!')
    user_id = reg['user']['id']

    # Set up mock Redis to return a valid token payload
    token = 'test-reset-token-abc'
    payload = json.dumps({'userId': user_id, 'email': 'reset@test.com'})

    fake_redis = AsyncMock()
    fake_redis.getdel.return_value = payload
    fake_redis.delete.return_value = 1

    with (
        patch('app.services.password_reset_service.get_redis', return_value=fake_redis),
        patch('app.db.async_session', _TestSession),
    ):
        resp = await client.post(
            '/api/v1/auth/reset-password',
            json={'token': token, 'password': 'NewPass456!'},
        )
        assert resp.status_code == 200
        assert 'reset successfully' in resp.json()['data']['message'].lower()
        # Verify token was consumed atomically by GETDEL (not a separate DELETE)
        fake_redis.getdel.assert_called_once_with(f'password-reset:{token}')
        fake_redis.delete.assert_not_called()


@pytest.mark.asyncio
async def test_reset_password_then_login(client):
    """User can login with new password after reset."""
    reg = await register_user(client, email='loginreset@test.com', password='OldPass123!')
    user_id = reg['user']['id']

    token = 'reset-login-token'
    payload = json.dumps({'userId': user_id, 'email': 'loginreset@test.com'})

    fake_redis = AsyncMock()
    fake_redis.getdel.return_value = payload
    fake_redis.delete.return_value = 1

    with (
        patch('app.services.password_reset_service.get_redis', return_value=fake_redis),
        patch('app.db.async_session', _TestSession),
    ):
        resp = await client.post(
            '/api/v1/auth/reset-password',
            json={'token': token, 'password': 'BrandNew789!'},
        )
        assert resp.status_code == 200

    # Login with new password
    resp = await client.post(
        '/api/v1/auth/login',
        json={'email': 'loginreset@test.com', 'password': 'BrandNew789!'},
    )
    assert resp.status_code == 200

    # Old password should no longer work
    resp = await client.post(
        '/api/v1/auth/login',
        json={'email': 'loginreset@test.com', 'password': 'OldPass123!'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reset_password_short_password(client):
    """Returns 422 for password shorter than 8 chars."""
    resp = await client.post(
        '/api/v1/auth/reset-password',
        json={'token': 'some-token', 'password': 'short'},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reset_password_token_consumed_atomically(client):
    """Second reset with the same token must fail because GETDEL consumed it.

    Pre-fix, the code did GET then DEL in separate steps — two concurrent
    requests could both GET the same payload before either DELeted it.
    Now GETDEL consumes atomically: only the first request sees the
    payload, the second gets None and 400s.
    """
    reg = await register_user(client, email='race@test.com', password='OldPass123!')
    user_id = reg['user']['id']

    token = 'race-token'
    payload = json.dumps({'userId': user_id, 'email': 'race@test.com'})

    # First call returns the payload; second call (atomic consume already done)
    # returns None — simulating the realistic concurrent case where the second
    # request's GETDEL runs after the first's already consumed the key.
    fake_redis = AsyncMock()
    fake_redis.getdel.side_effect = [payload, None]
    fake_redis.delete.return_value = 1

    with (
        patch('app.services.password_reset_service.get_redis', return_value=fake_redis),
        patch('app.db.async_session', _TestSession),
    ):
        first = await client.post(
            '/api/v1/auth/reset-password',
            json={'token': token, 'password': 'FirstNew456!'},
        )
        second = await client.post(
            '/api/v1/auth/reset-password',
            json={'token': token, 'password': 'SecondNew789!'},
        )

    assert first.status_code == 200
    assert second.status_code == 400
    assert second.json()['detail']['code'] == 'INVALID_TOKEN'
