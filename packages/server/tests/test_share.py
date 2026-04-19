"""Tests for share endpoints — create, retrieve, list, delete, export."""

import pytest

from tests.conftest import auth_headers, register_user

FAKE_UUID = '99999999-9999-9999-9999-999999999999'


async def _create_book(client, token, **overrides):
    """Helper to create a book and return response JSON."""
    payload = {
        'title': 'Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post(
        '/api/v1/books',
        json=payload,
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, f'Book creation failed: {resp.text}'
    return resp.json()['data']


def _share_payload(book_id: str) -> dict:
    return {
        'book_id': book_id,
        'format': 'html',
        'content_type': 'text/html',
        'title': 'My Book',
    }


# ---------------------------------------------------------------------------
# POST /api/v1/share/ — create share
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_share_returns_201(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        '/api/v1/share/',
        headers=headers,
        json=_share_payload(book['id']),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert 'id' in data
    assert 'token' in data
    assert 'share_url' in data
    assert data['format'] == 'html'
    assert data['title'] == 'My Book'


# ---------------------------------------------------------------------------
# GET /api/v1/share/ — list shares
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_shares_returns_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/share/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['data']['items'] == []


@pytest.mark.asyncio
async def test_list_shares_returns_created(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    await client.post(
        '/api/v1/share/', headers=headers, json=_share_payload(book['id']),
    )

    resp = await client.get('/api/v1/share/', headers=headers)
    assert resp.status_code == 200
    items = resp.json()['data']['items']
    assert len(items) == 1


# ---------------------------------------------------------------------------
# GET /api/v1/share/s/{token} — get shared content (NO AUTH)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_shared_content_by_token(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    create = await client.post(
        '/api/v1/share/', headers=headers, json=_share_payload(book['id']),
    )
    token = create.json()['data']['token']

    # Retrieve without auth
    resp = await client.get(f'/api/v1/share/s/{token}')
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert 'title' in data
    assert 'format' in data
    assert 'content' in data
    assert data['format'] == 'html'


@pytest.mark.asyncio
async def test_get_shared_content_returns_404_for_bad_token(client):
    resp = await client.get('/api/v1/share/s/nonexistent-token')
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/share/{share_id} — delete share
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_share_returns_204(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    create = await client.post(
        '/api/v1/share/', headers=headers, json=_share_payload(book['id']),
    )
    share_id = create.json()['data']['id']

    resp = await client.delete(
        f'/api/v1/share/{share_id}', headers=headers,
    )
    assert resp.status_code == 204

    # Verify gone from list
    list_resp = await client.get('/api/v1/share/', headers=headers)
    assert list_resp.json()['data']['items'] == []


@pytest.mark.asyncio
async def test_delete_share_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete(
        f'/api/v1/share/{FAKE_UUID}', headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/share/export — export alias
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_share_returns_201(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        '/api/v1/share/export',
        headers=headers,
        json=_share_payload(book['id']),
    )
    assert resp.status_code == 201
    data = resp.json()['data']
    assert 'id' in data
    assert 'token' in data


# ---------------------------------------------------------------------------
# GET /api/v1/share/reading-card — reading card
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reading_card_returns_data(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/share/reading-card', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'total_shares' in body['data']
    assert 'shares' in body['data']
    assert body['data']['total_shares'] == 0


@pytest.mark.asyncio
async def test_reading_card_counts_shares(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book1 = await _create_book(client, reg['token'], title='Book One')
    book2 = await _create_book(client, reg['token'], title='Book Two')

    await client.post(
        '/api/v1/share/',
        headers=headers,
        json={
            'book_id': book1['id'],
            'format': 'html',
            'content_type': 'text/html',
            'title': 'My Book',
        },
    )
    await client.post(
        '/api/v1/share/',
        headers=headers,
        json={
            'book_id': book2['id'],
            'format': 'pdf',
            'content_type': 'application/pdf',
            'title': 'Another Book',
        },
    )

    resp = await client.get('/api/v1/share/reading-card', headers=headers)
    assert resp.status_code == 200
    assert resp.json()['data']['total_shares'] == 2


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/share/',
        json={'book_id': FAKE_UUID, 'format': 'html', 'title': 'X', 'content_type': 'text/html'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_returns_401_without_auth(client):
    resp = await client.get('/api/v1/share/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_delete_returns_401_without_auth(client):
    resp = await client.delete(f'/api/v1/share/{FAKE_UUID}')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_export_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/share/export',
        json={'book_id': FAKE_UUID, 'format': 'html', 'title': 'X', 'content_type': 'text/html'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reading_card_returns_401_without_auth(client):
    resp = await client.get('/api/v1/share/reading-card')
    assert resp.status_code == 401
