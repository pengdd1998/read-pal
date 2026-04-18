"""Tests for account management routes — PATCH /me and DELETE /account."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/me — profile updates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_name(client):
    """PATCH /me updates name successfully."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        '/api/v1/auth/me',
        headers=headers,
        json={'name': 'New Name'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['name'] == 'New Name'
    assert body['data']['email'] == 'test@example.com'


@pytest.mark.asyncio
async def test_update_avatar(client):
    """PATCH /me updates avatar successfully."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        '/api/v1/auth/me',
        headers=headers,
        json={'avatar': 'https://example.com/avatar.png'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['avatar'] == 'https://example.com/avatar.png'


@pytest.mark.asyncio
async def test_update_settings_merges(client):
    """PATCH /me merges settings dict (partial update)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    # Set initial settings
    await client.patch(
        '/api/v1/auth/me',
        headers=headers,
        json={'settings': {'theme': 'dark', 'fontSize': 18}},
    )

    # Partial update — should merge, not replace
    resp = await client.patch(
        '/api/v1/auth/me',
        headers=headers,
        json={'settings': {'language': 'en'}},
    )
    assert resp.status_code == 200
    settings = resp.json()['data']['settings']
    assert settings['theme'] == 'dark'
    assert settings['fontSize'] == 18
    assert settings['language'] == 'en'


@pytest.mark.asyncio
async def test_update_me_unauthenticated(client):
    """PATCH /me returns 401 without auth."""
    resp = await client.patch(
        '/api/v1/auth/me',
        json={'name': 'Hacker'},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account — account deletion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_account(client):
    """DELETE /account deletes user successfully."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete('/api/v1/auth/account', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'deleted' in body['data']['message'].lower()

    # Subsequent request with the same token should fail (user gone)
    resp2 = await client.get('/api/v1/auth/me', headers=headers)
    assert resp2.status_code == 401


@pytest.mark.asyncio
async def test_delete_account_unauthenticated(client):
    """DELETE /account returns 401 without auth."""
    resp = await client.delete('/api/v1/auth/account')
    assert resp.status_code == 401
