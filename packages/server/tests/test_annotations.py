"""Tests for annotation CRUD endpoints."""

import pytest

from tests.conftest import auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 200,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


async def _create_annotation(client, token, book_id, **overrides):
    payload = {
        'book_id': book_id,
        'type': 'highlight',
        'location': {'chapter': 1, 'position': 100},
        'content': 'A wonderful quote from the book.',
        **overrides,
    }
    resp = await client.post(
        '/api/v1/annotations',
        json=payload,
        headers=auth_headers(token),
    )
    assert resp.status_code in (200, 201), f'Annotation creation failed: {resp.status_code} {resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/annotations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_annotation(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(client, reg['token'], book['id'])
    assert ann['content'] == 'A wonderful quote from the book.'
    assert ann['type'] == 'highlight'
    assert ann['book_id'] == book['id']


@pytest.mark.asyncio
async def test_create_annotation_with_note(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(
        client, reg['token'], book['id'],
        type='note',
        note='This reminds me of...',
        tags=['philosophy', 'chapter-1'],
    )
    assert ann['type'] == 'note'
    assert ann['note'] == 'This reminds me of...'
    assert 'philosophy' in ann.get('tags', [])


@pytest.mark.asyncio
async def test_create_annotation_unauthenticated(client):
    resp = await client.post('/api/v1/annotations', json={
        'book_id': '00000000-0000-0000-0000-000000000000',
        'type': 'highlight',
        'content': 'test',
        'location': {},
    })
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/annotations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_annotations(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])
    await _create_annotation(client, reg['token'], book['id'], content='Second quote')

    resp = await client.get('/api/v1/annotations', headers=auth_headers(reg['token']))
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 2


@pytest.mark.asyncio
async def test_list_annotations_filter_by_book(client):
    reg = await register_user(client)
    book_a = await _create_book(client, reg['token'], title='Book A')
    book_b = await _create_book(client, reg['token'], title='Book B')
    await _create_annotation(client, reg['token'], book_a['id'])
    await _create_annotation(client, reg['token'], book_b['id'])

    resp = await client.get(
        f"/api/v1/annotations?book_id={book_a['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 1
    for ann in data['data']:
        assert ann['book_id'] == book_a['id']


@pytest.mark.asyncio
async def test_list_annotations_filter_by_type(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'], type='highlight')
    await _create_annotation(client, reg['token'], book['id'], type='bookmark')

    resp = await client.get(
        '/api/v1/annotations?type=highlight',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 1
    for ann in data['data']:
        assert ann['type'] == 'highlight'


# ---------------------------------------------------------------------------
# GET /api/v1/annotations/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_annotation(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/annotations/{ann['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert resp.json()['data']['content'] == 'A wonderful quote from the book.'


@pytest.mark.asyncio
async def test_get_annotation_not_found(client):
    reg = await register_user(client)
    resp = await client.get(
        '/api/v1/annotations/00000000-0000-0000-0000-000000000000',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/annotations/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_annotation(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(client, reg['token'], book['id'])

    resp = await client.patch(
        f"/api/v1/annotations/{ann['id']}",
        json={'note': 'Updated note text', 'color': '#ff0000'},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    updated = resp.json()['data']
    assert updated['note'] == 'Updated note text'
    assert updated['color'] == '#ff0000'


@pytest.mark.asyncio
async def test_update_annotation_tags(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(client, reg['token'], book['id'])

    resp = await client.patch(
        f"/api/v1/annotations/{ann['id']}",
        json={'tags': ['important', 'review']},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert 'important' in resp.json()['data']['tags']


# ---------------------------------------------------------------------------
# DELETE /api/v1/annotations/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_annotation(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    ann = await _create_annotation(client, reg['token'], book['id'])

    resp = await client.delete(
        f"/api/v1/annotations/{ann['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200

    # Verify it's gone
    resp = await client.get(
        f"/api/v1/annotations/{ann['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/annotations/search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_annotations(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'], content='Unique search phrase xyz')

    resp = await client.get(
        '/api/v1/annotations/search?q=xyz',
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 1


# ---------------------------------------------------------------------------
# GET /api/v1/annotations/tags
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason='Uses PostgreSQL unnest() — not available in SQLite test DB')
@pytest.mark.asyncio
async def test_get_tags(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'], tags=['fiction', 'classic'])

    resp = await client.get(
        f"/api/v1/annotations/tags?bookId={book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 'data' in data


# ---------------------------------------------------------------------------
# GET /api/v1/annotations/stats/chapters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chapter_stats(client):
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])
    await _create_annotation(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/annotations/stats/chapters?book_id={book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    assert 'data' in resp.json()
