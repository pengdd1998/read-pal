"""Tests for settings endpoints — get, update, reading goals."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# GET /api/v1/settings/
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_settings_returns_defaults_for_new_user(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/settings/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], dict)


# ---------------------------------------------------------------------------
# PATCH /api/v1/settings/
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_settings_merges_values(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        '/api/v1/settings/',
        headers=headers,
        json={'theme': 'dark', 'fontSize': 18},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['theme'] == 'dark'
    assert body['data']['fontSize'] == 18


@pytest.mark.asyncio
async def test_update_settings_preserves_existing_keys(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    # First update
    await client.patch(
        '/api/v1/settings/',
        headers=headers,
        json={'theme': 'dark'},
    )

    # Second update — should merge, not replace
    resp = await client.patch(
        '/api/v1/settings/',
        headers=headers,
        json={'fontSize': 20},
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data['theme'] == 'dark'
    assert data['fontSize'] == 20


# ---------------------------------------------------------------------------
# GET /api/v1/settings/reading-goals
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reading_goals_returns_defaults(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/settings/reading-goals', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    goals = body['data']
    # New shape returns computed progress, not raw preferences
    assert 'goal' in goals
    assert 'completed' in goals
    assert 'onTrack' in goals
    assert 'dailyGoalMinutes' in goals
    assert 'todayMinutes' in goals
    assert 'dailyOnTrack' in goals


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_settings_returns_401_without_auth(client):
    resp = await client.get('/api/v1/settings/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_settings_returns_401_without_auth(client):
    resp = await client.patch('/api/v1/settings/', json={'theme': 'dark'})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reading_goals_returns_401_without_auth(client):
    resp = await client.get('/api/v1/settings/reading-goals')
    assert resp.status_code == 401
