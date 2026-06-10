"""Tests for collection endpoints — CRUD and book management."""

import pytest

from tests.conftest import auth_headers, register_user

FAKE_UUID = '99999999-9999-9999-9999-999999999999'


async def _create_book(client, token, **overrides):
    """Create a book via API and return its data."""
    payload = {
        'title': 'Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 1024,
        'total_pages': 100,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/collections/ — create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_collection_returns_201(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        '/api/v1/collections/',
        headers=headers,
        json={'name': 'My Books'},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body['success'] is True
    data = body['data']
    assert 'id' in data
    assert data['name'] == 'My Books'
    assert data['book_ids'] == []


# ---------------------------------------------------------------------------
# GET /api/v1/collections/ — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_collections_returns_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/collections/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['data']['items'] == []


@pytest.mark.asyncio
async def test_list_collections_returns_created(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'A'},
    )
    await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'B'},
    )

    resp = await client.get('/api/v1/collections/', headers=headers)
    assert resp.status_code == 200
    items = resp.json()['data']['items']
    assert len(items) == 2


# ---------------------------------------------------------------------------
# GET /api/v1/collections/{id} — get one
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_collection_returns_data(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Sci-Fi'},
    )
    col_id = create.json()['data']['id']

    resp = await client.get(f'/api/v1/collections/{col_id}', headers=headers)
    assert resp.status_code == 200
    assert resp.json()['data']['name'] == 'Sci-Fi'


@pytest.mark.asyncio
async def test_get_collection_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(f'/api/v1/collections/{FAKE_UUID}', headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/collections/{id} — update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_collection_changes_name(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Old'},
    )
    col_id = create.json()['data']['id']

    resp = await client.patch(
        f'/api/v1/collections/{col_id}',
        headers=headers,
        json={'name': 'Updated'},
    )
    assert resp.status_code == 200
    assert resp.json()['data']['name'] == 'Updated'


@pytest.mark.asyncio
async def test_update_collection_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.patch(
        f'/api/v1/collections/{FAKE_UUID}',
        headers=headers,
        json={'name': 'X'},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/collections/{id} — delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_collection_returns_204(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Bye'},
    )
    col_id = create.json()['data']['id']

    resp = await client.delete(
        f'/api/v1/collections/{col_id}', headers=headers,
    )
    assert resp.status_code == 204

    # Verify gone
    get_resp = await client.get(
        f'/api/v1/collections/{col_id}', headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_collection_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete(
        f'/api/v1/collections/{FAKE_UUID}', headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/collections/{id}/books — get books
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_collection_books_returns_empty(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Empty'},
    )
    col_id = create.json()['data']['id']

    resp = await client.get(
        f'/api/v1/collections/{col_id}/books', headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()['data']['book_ids'] == []


@pytest.mark.asyncio
async def test_get_collection_books_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        f'/api/v1/collections/{FAKE_UUID}/books', headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/collections/{id}/books — add books batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_books_batch(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    # Create real books so FK constraints are satisfied
    book1 = await _create_book(client, reg['token'], title='Book 1')
    book2 = await _create_book(client, reg['token'], title='Book 2')
    book_id_1 = book1['id']
    book_id_2 = book2['id']

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Batch'},
    )
    col_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/collections/{col_id}/books',
        headers=headers,
        json={'bookIds': [book_id_1, book_id_2]},
    )
    assert resp.status_code == 200
    book_ids = resp.json()['data']['book_ids']
    assert book_id_1 in book_ids
    assert book_id_2 in book_ids


@pytest.mark.asyncio
async def test_add_books_batch_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books',
        headers=headers,
        json={'bookIds': [book['id']]},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/collections/{id}/books/{book_id} — add single book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_single_book(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Single'},
    )
    col_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/collections/{col_id}/books/{book["id"]}',
        headers=headers,
    )
    assert resp.status_code == 200
    assert book['id'] in resp.json()['data']['book_ids']


@pytest.mark.asyncio
async def test_add_single_book_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books/{book["id"]}',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/collections/{id}/books/{book_id} — remove single book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_single_book(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Remove'},
    )
    col_id = create.json()['data']['id']

    # Add first
    await client.post(
        f'/api/v1/collections/{col_id}/books/{book["id"]}',
        headers=headers,
    )

    # Remove
    resp = await client.delete(
        f'/api/v1/collections/{col_id}/books/{book["id"]}',
        headers=headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_remove_single_book_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.delete(
        f'/api/v1/collections/{FAKE_UUID}/books/{book["id"]}',
        headers=headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/collections/{id}/books/remove — remove books batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_books_batch(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book1 = await _create_book(client, reg['token'], title='Rm Book 1')
    book2 = await _create_book(client, reg['token'], title='Rm Book 2')

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'BatchRm'},
    )
    col_id = create.json()['data']['id']

    # Add books first
    await client.post(
        f'/api/v1/collections/{col_id}/books',
        headers=headers,
        json={'bookIds': [book1['id'], book2['id']]},
    )

    # Remove batch
    resp = await client.post(
        f'/api/v1/collections/{col_id}/books/remove',
        headers=headers,
        json={'bookIds': [book1['id']]},
    )
    assert resp.status_code == 200
    assert book1['id'] not in resp.json()['data']['book_ids']
    assert book2['id'] in resp.json()['data']['book_ids']


@pytest.mark.asyncio
async def test_remove_books_batch_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books/remove',
        headers=headers,
        json={'bookIds': [book['id']]},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_returns_401_without_auth(client):
    resp = await client.post(
        '/api/v1/collections/', json={'name': 'NoAuth'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_returns_401_without_auth(client):
    resp = await client.get('/api/v1/collections/')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_returns_401_without_auth(client):
    resp = await client.get(f'/api/v1/collections/{FAKE_UUID}')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_returns_401_without_auth(client):
    resp = await client.patch(
        f'/api/v1/collections/{FAKE_UUID}', json={'name': 'X'},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_delete_returns_401_without_auth(client):
    resp = await client.delete(f'/api/v1/collections/{FAKE_UUID}')
    assert resp.status_code == 401
