"""Tests for API key routes — CRUD for personal access tokens."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# POST /api/v1/api-keys/ — create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_api_key_with_name(client):
    """POST / creates an API key with a custom name."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/api-keys/',
        headers=headers,
        json={'name': 'My Key'},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    assert body['data']['name'] == 'My Key'
    assert body['data']['key'] is not None
    assert body['data']['key_prefix'] is not None
    assert 'id' in body['data']


@pytest.mark.asyncio
async def test_create_api_key_default_name(client):
    """POST / uses default name 'API Key' when name not provided."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/api-keys/',
        headers=headers,
        json={},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    assert body['data']['name'] == 'API Key'


# ---------------------------------------------------------------------------
# GET /api/v1/api-keys/ — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_api_keys_empty(client):
    """GET / lists user's API keys (returns empty list initially)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/api-keys/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data'] == []


@pytest.mark.asyncio
async def test_list_api_keys_after_create(client):
    """GET / lists created API keys."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    # Create two keys
    await client.post(
        '/api/v1/api-keys/', headers=headers, json={'name': 'Key A'},
    )
    await client.post(
        '/api/v1/api-keys/', headers=headers, json={'name': 'Key B'},
    )

    resp = await client.get('/api/v1/api-keys/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert len(body['data']) == 2
    names = {k['name'] for k in body['data']}
    assert names == {'Key A', 'Key B'}


# ---------------------------------------------------------------------------
# DELETE /api/v1/api-keys/{key_id} — delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_api_key(client):
    """DELETE /{key_id} deletes an API key (204)."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create_resp = await client.post(
        '/api/v1/api-keys/', headers=headers, json={'name': 'To Delete'},
    )
    key_id = create_resp.json()['data']['id']

    resp = await client.delete(f'/api/v1/api-keys/{key_id}', headers=headers)
    assert resp.status_code == 204

    # Verify it no longer appears in list
    list_resp = await client.get('/api/v1/api-keys/', headers=headers)
    assert list_resp.json()['data'] == []


@pytest.mark.asyncio
async def test_delete_api_key_not_found(client):
    """DELETE /{key_id} returns 404 for non-existent key."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete(
        '/api/v1/api-keys/00000000-0000-0000-0000-000000000000',
        headers=headers,
    )
    assert resp.status_code == 404
    assert resp.json()['detail']['code'] == 'NOT_FOUND'


# ---------------------------------------------------------------------------
# Scoping — API keys are user-specific
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_keys_scoped_to_user(client):
    """User B cannot see or delete user A's API keys."""
    # User A creates a key
    reg_a = await register_user(client, email='user-a@test.com', name='User A')
    headers_a = auth_headers(reg_a['token'])
    create_resp = await client.post(
        '/api/v1/api-keys/', headers=headers_a, json={'name': "A's Key"},
    )
    key_id_a = create_resp.json()['data']['id']

    # User B registers and lists keys
    reg_b = await register_user(client, email='user-b@test.com', name='User B')
    headers_b = auth_headers(reg_b['token'])

    list_resp = await client.get('/api/v1/api-keys/', headers=headers_b)
    assert list_resp.status_code == 200
    assert list_resp.json()['data'] == []

    # User B cannot delete user A's key
    del_resp = await client.delete(
        f'/api/v1/api-keys/{key_id_a}', headers=headers_b,
    )
    assert del_resp.status_code == 404

    # User A's key still exists
    list_a = await client.get('/api/v1/api-keys/', headers=headers_a)
    assert len(list_a.json()['data']) == 1
