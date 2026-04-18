"""Tests for book CRUD endpoints."""

import pytest

from tests.conftest import auth_headers, register_user


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
    assert resp.status_code == 201, f'Book creation failed: status={resp.status_code} body={resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/books
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    assert book['title'] == 'Test Book'
    assert book['author'] == 'Test Author'
    assert 'id' in book


@pytest.mark.asyncio
async def test_create_book_unauthenticated(client):
    resp = await client.post('/api/v1/books', json={'title': 'X', 'author': 'Y'})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/books
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_books(client):
    reg = await register_user(client)
    await _create_book(client, reg['token'], title='Book A')
    await _create_book(client, reg['token'], title='Book B')

    resp = await client.get('/api/v1/books', headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 2


@pytest.mark.asyncio
async def test_list_books_empty(client):
    reg = await register_user(client)
    # Delete the auto-seeded book first
    resp = await client.get('/api/v1/books', headers=auth_headers(reg['token']))
    books = resp.json().get('data', [])
    for b in books:
        await client.delete(f"/api/v1/books/{b['id']}", headers=auth_headers(reg['token']))

    resp = await client.get('/api/v1/books', headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    assert resp.json()['total'] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/books/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    resp = await client.get(f"/api/v1/books/{book['id']}", headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    assert resp.json()['data']['title'] == 'Test Book'


@pytest.mark.asyncio
async def test_get_book_not_found(client):
    reg = await register_user(client)
    resp = await client.get(
        '/api/v1/books/00000000-0000-0000-0000-000000000000',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/books/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    resp = await client.patch(
        f"/api/v1/books/{book['id']}",
        json={'title': 'Updated Title', 'currentPage': 50},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert resp.json()['data']['title'] == 'Updated Title'


# ---------------------------------------------------------------------------
# DELETE /api/v1/books/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_book(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    resp = await client.delete(f"/api/v1/books/{book['id']}", headers=auth_headers(reg['token']))
    assert resp.status_code == 200

    # Verify it's gone
    resp = await client.get(f"/api/v1/books/{book['id']}", headers=auth_headers(reg['token']))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/v1/books/{id}/tags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_book_tags(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    resp = await client.put(
        f"/api/v1/books/{book['id']}/tags",
        json={'tags': ['fiction', 'sci-fi']},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert 'sci-fi' in resp.json()['data']['tags']


# ---------------------------------------------------------------------------
# POST /api/v1/books/seed-sample
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_seed_sample_book(client):
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/books/seed-sample',
        json={'title': 'Sample', 'author': 'Author'},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 201
    assert resp.json()['data']['title'] == 'Sample'


# ---------------------------------------------------------------------------
# GET /api/v1/books/stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_book_stats(client):
    reg = await register_user(client)
    resp = await client.get('/api/v1/books/stats', headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    assert 'data' in resp.json()
