"""Tests for notification endpoints — list, mark read, mark all read."""

import pytest

from tests.conftest import auth_headers, register_user

FAKE_UUID = '99999999-9999-9999-9999-999999999999'


# ---------------------------------------------------------------------------
# GET /api/v1/notifications/ — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_notifications_returns_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/notifications/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert data['items'] == []
    assert data['total'] == 0
    assert data['page'] == 1
    assert data['per_page'] == 20


@pytest.mark.asyncio
async def test_list_notifications_accepts_query_params(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/notifications/?unread_only=true&page=1&per_page=10',
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data['per_page'] == 10


# ---------------------------------------------------------------------------
# PATCH /api/v1/notifications/{id} — mark read/unread
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_notification_read_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}',
        headers=headers,
        json={'read': True},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/notifications/{id}/read — mark read alias
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_read_alias_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}/read',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/notifications/mark-all-read
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_all_read_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/notifications/mark-all-read',
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'message' in body['data']


# ---------------------------------------------------------------------------
# GET /api/v1/notifications/unread-count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unread_count_returns_zero(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/notifications/unread-count',
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] == 0


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_returns_401_without_auth(client):
    resp = await client.get('/api/v1/notifications/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_read_returns_401_without_auth(client):
    resp = await client.patch(
        f'/api/v1/notifications/{FAKE_UUID}', json={'read': True},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_read_alias_returns_401_without_auth(client):
    resp = await client.patch(f'/api/v1/notifications/{FAKE_UUID}/read')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mark_all_read_returns_401_without_auth(client):
    resp = await client.post('/api/v1/notifications/mark-all-read')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_unread_count_returns_401_without_auth(client):
    resp = await client.get('/api/v1/notifications/unread-count')
    assert resp.status_code == 401
