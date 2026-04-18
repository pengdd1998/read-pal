"""Tests for auth endpoints — register, login, me, refresh, logout."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_success(client):
    data = await register_user(client)
    assert 'token' in data
    assert 'user' in data
    assert data['user']['email'] == 'test@example.com'
    assert data['user']['name'] == 'Test User'
    assert 'id' in data['user']


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    await register_user(client, email='dup@example.com')
    resp = await client.post(
        '/api/v1/auth/register',
        json={
            'email': 'dup@example.com',
            'password': 'Pass123!',
            'name': 'Another',
            'confirmPassword': 'Pass123!',
        },
    )
    assert resp.status_code == 409
    assert resp.json()['detail']['code'] == 'USER_EXISTS'


@pytest.mark.asyncio
async def test_register_missing_fields(client):
    resp = await client.post('/api/v1/auth/register', json={'email': 'a@b.com'})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_success(client):
    await register_user(client, email='login@test.com', password='MyPass123!')
    resp = await client.post(
        '/api/v1/auth/login',
        json={'email': 'login@test.com', 'password': 'MyPass123!'},
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert 'token' in data
    assert data['user']['email'] == 'login@test.com'


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await register_user(client, email='wrong@test.com', password='Correct123!')
    resp = await client.post(
        '/api/v1/auth/login',
        json={'email': 'wrong@test.com', 'password': 'WrongPass!'},
    )
    assert resp.status_code == 401
    assert resp.json()['detail']['code'] == 'INVALID_CREDENTIALS'


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    resp = await client.post(
        '/api/v1/auth/login',
        json={'email': 'nobody@test.com', 'password': 'Whatever123!'},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_me_authenticated(client):
    reg = await register_user(client)
    resp = await client.get('/api/v1/auth/me', headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data['email'] == 'test@example.com'
    assert data['name'] == 'Test User'


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client):
    resp = await client.get('/api/v1/auth/me')
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_profile(client):
    reg = await register_user(client)
    resp = await client.patch(
        '/api/v1/auth/me',
        headers=auth_headers(reg['token']),
        json={'name': 'Updated Name'},
    )
    assert resp.status_code == 200
    assert resp.json()['data']['name'] == 'Updated Name'


@pytest.mark.asyncio
async def test_update_settings(client):
    reg = await register_user(client)
    resp = await client.patch(
        '/api/v1/auth/me',
        headers=auth_headers(reg['token']),
        json={'settings': {'theme': 'dark', 'fontSize': 18}},
    )
    assert resp.status_code == 200
    settings = resp.json()['data']['settings']
    assert settings['theme'] == 'dark'
    assert settings['fontSize'] == 18


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout(client):
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/auth/logout',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert 'Logged out' in resp.json()['data']['message']


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_token(client):
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/auth/refresh',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert 'token' in data
    # New token should be different
    assert data['token'] != reg['token']


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_account(client):
    reg = await register_user(client)
    resp = await client.delete(
        '/api/v1/auth/account',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200

    # Verify user is gone
    resp = await client.get('/api/v1/auth/me', headers=auth_headers(reg['token']))
    assert resp.status_code == 401
