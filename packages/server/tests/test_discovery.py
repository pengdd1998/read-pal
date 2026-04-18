"""Tests for discovery endpoints — search, semantic, free-books."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_book(client, headers, title='Test Book', author='Author'):
    """Create a book and return the response JSON."""
    resp = await client.post(
        '/api/v1/books',
        headers=headers,
        json={
            'title': title,
            'author': author,
            'file_type': 'epub',
            'file_size': 1024,
            'total_pages': 200,
        },
    )
    assert resp.status_code == 201, f'Book creation failed: {resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# GET /api/v1/discovery/search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_returns_success_for_new_user(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/discovery/search', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert 'items' in body['data']
    assert 'total' in body['data']
    # Auto-seed creates at least one book for new users
    assert body['data']['total'] >= 1


@pytest.mark.asyncio
async def test_search_returns_books_matching_query(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_book(client, headers, title='War and Peace', author='Tolstoy')
    await _create_book(client, headers, title='Moby Dick', author='Melville')

    resp = await client.get('/api/v1/discovery/search?q=moby', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert body['data']['total'] == 1
    assert body['data']['items'][0]['title'] == 'Moby Dick'


@pytest.mark.asyncio
async def test_search_by_author(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_book(client, headers, title='Book A', author='Orwell')
    await _create_book(client, headers, title='Book B', author='Fitzgerald')

    resp = await client.get('/api/v1/discovery/search?q=orwell', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['data']['total'] == 1
    assert body['data']['items'][0]['author'] == 'Orwell'


@pytest.mark.asyncio
async def test_search_empty_query_returns_recent_books(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_book(client, headers, title='Book A', author='Author A')
    await _create_book(client, headers, title='Book B', author='Author B')

    resp = await client.get('/api/v1/discovery/search', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    # 1 seed book + 2 created
    assert body['data']['total'] == 3


@pytest.mark.asyncio
async def test_search_pagination(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    for i in range(5):
        await _create_book(client, headers, title=f'Book {i}', author='Author')

    resp = await client.get('/api/v1/discovery/search?limit=2&page=1', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['data']['total'] == 6  # 1 seed + 5 created
    assert len(body['data']['items']) == 2
    assert body['data']['page'] == 1
    assert body['data']['limit'] == 2


# ---------------------------------------------------------------------------
# GET /api/v1/discovery/semantic
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_semantic_search_returns_books(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_book(client, headers, title='Python Programming', author='Guido')

    resp = await client.get('/api/v1/discovery/semantic?q=python', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert body['data']['total'] == 1


@pytest.mark.asyncio
async def test_semantic_search_finds_via_annotations(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    book = await _create_book(client, headers, title='Physics 101', author='Newton')

    # Create an annotation with content containing 'gravity'
    await client.post(
        '/api/v1/annotations',
        headers=headers,
        json={
            'book_id': book['id'],
            'type': 'highlight',
            'content': 'The law of gravity states that objects fall',
            'location': {'page': 42},
        },
    )

    resp = await client.get('/api/v1/discovery/semantic?q=gravity', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['data']['total'] == 1
    assert body['data']['items'][0]['title'] == 'Physics 101'


# ---------------------------------------------------------------------------
# GET /api/v1/discovery/free-books
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_free_books_returns_empty_for_no_completed(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    await _create_book(client, headers, title='Unread Book', author='Author')

    resp = await client.get('/api/v1/discovery/free-books', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert body['data']['total'] == 0


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_returns_401_without_auth(client):
    resp = await client.get('/api/v1/discovery/search')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_semantic_returns_401_without_auth(client):
    resp = await client.get('/api/v1/discovery/semantic')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_free_books_returns_401_without_auth(client):
    resp = await client.get('/api/v1/discovery/free-books')
    assert resp.status_code == 401
