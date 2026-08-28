"""Tests for collection endpoints — CRUD and book management."""

import pytest

from tests.conftest import auth_headers, register_user

BOOK_ID = '00000000-0000-0000-0000-000000000001'
BOOK_ID_2 = '00000000-0000-0000-0000-000000000002'
FAKE_UUID = '99999999-9999-9999-9999-999999999999'


async def _create_book_for_user(reg: dict, book_id: str, title: str = 'Test Book') -> None:
    """Insert a Book row owned by the registered user with a fixed ID."""
    from uuid import UUID

    from app.models.book import Book
    from sqlalchemy import select
    from tests.conftest import _TestSession

    async with _TestSession() as db:
        user_id = UUID(reg['user']['id']) if isinstance(reg['user']['id'], str) else reg['user']['id']
        book = Book(
            id=UUID(book_id),
            user_id=user_id,
            title=title,
            author='A',
            file_type='epub',
            file_size=1024,
            total_pages=10,
        )
        db.add(book)
        await db.commit()



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
    assert data['bookIds'] == []


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
    # `data` is now the bare items array (pagination fields are siblings)
    assert body['data'] == []


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
    items = resp.json()['data']
    assert len(items) == 2


# ---------------------------------------------------------------------------
# GET /api/v1/collections/ — pagination
# ---------------------------------------------------------------------------


async def _create_n_collections(client, headers: dict, n: int) -> None:
    """Create n collections named 'Collection 1'.. 'Collection N'."""
    for i in range(1, n + 1):
        resp = await client.post(
            '/api/v1/collections/', headers=headers, json={'name': f'Collection {i}'},
        )
        assert resp.status_code == 201


@pytest.mark.asyncio
async def test_list_collections_default_pagination_fields(client):
    """Default request returns page=1, perPage=20, hasMore=False plus totals."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    await _create_n_collections(client, headers, 3)

    resp = await client.get('/api/v1/collections/', headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    # `data` stays the items array — existing frontend consumers depend on it
    assert isinstance(body['data'], list)
    assert len(body['data']) == 3
    assert body['total'] == 3
    assert body['page'] == 1
    assert body['perPage'] == 20
    assert body['hasMore'] is False


@pytest.mark.asyncio
async def test_list_collections_per_page_clamped_to_100(client):
    """per_page above 100 is rejected by validation, not silently applied."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/collections/', headers=headers, params={'per_page': 500},
    )
    assert resp.status_code == 422

    resp = await client.get(
        '/api/v1/collections/', headers=headers, params={'per_page': 100},
    )
    assert resp.status_code == 200
    assert resp.json()['perPage'] == 100


@pytest.mark.asyncio
async def test_list_collections_has_more_across_page_boundary(client):
    """hasMore flips correctly at the page boundary and pages don't overlap."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    await _create_n_collections(client, headers, 5)

    page1 = await client.get(
        '/api/v1/collections/', headers=headers, params={'page': 1, 'per_page': 2},
    )
    assert page1.status_code == 200
    p1 = page1.json()
    assert len(p1['data']) == 2
    assert p1['total'] == 5
    assert p1['hasMore'] is True

    page2 = await client.get(
        '/api/v1/collections/', headers=headers, params={'page': 2, 'per_page': 2},
    )
    assert page2.status_code == 200
    p2 = page2.json()
    assert len(p2['data']) == 2
    assert p2['hasMore'] is True

    page3 = await client.get(
        '/api/v1/collections/', headers=headers, params={'page': 3, 'per_page': 2},
    )
    assert page3.status_code == 200
    p3 = page3.json()
    assert len(p3['data']) == 1
    assert p3['hasMore'] is False

    # No collection appears on two pages
    ids1 = {c['id'] for c in p1['data']}
    ids2 = {c['id'] for c in p2['data']}
    ids3 = {c['id'] for c in p3['data']}
    assert not (ids1 & ids2) and not (ids1 & ids3) and not (ids2 & ids3)

    # All 5 accounted for across pages
    assert len(ids1 | ids2 | ids3) == 5


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
    assert resp.json()['data']['bookIds'] == []


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
    await _create_book_for_user(reg, BOOK_ID, 'Book 1')
    await _create_book_for_user(reg, BOOK_ID_2, 'Book 2')

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Batch'},
    )
    col_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/collections/{col_id}/books',
        headers=headers,
        json={'bookIds': [BOOK_ID, BOOK_ID_2]},
    )
    assert resp.status_code == 200
    book_ids = resp.json()['data']['bookIds']
    assert BOOK_ID in book_ids
    assert BOOK_ID_2 in book_ids


@pytest.mark.asyncio
async def test_add_books_batch_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books',
        headers=headers,
        json={'bookIds': [BOOK_ID]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_books_batch_rejects_unowned_book(client):
    """Adding a book the user doesn't own must 404, not silently stash the ID."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Auth'},
    )
    col_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/collections/{col_id}/books',
        headers=headers,
        json={'bookIds': [FAKE_UUID]},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/collections/{id}/books/{book_id} — add single book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_single_book(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    await _create_book_for_user(reg, BOOK_ID, 'Single Book')

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Single'},
    )
    col_id = create.json()['data']['id']

    resp = await client.post(
        f'/api/v1/collections/{col_id}/books/{BOOK_ID}',
        headers=headers,
    )
    assert resp.status_code == 200
    assert BOOK_ID in resp.json()['data']['bookIds']


@pytest.mark.asyncio
async def test_add_single_book_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books/{BOOK_ID}',
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

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Remove'},
    )
    col_id = create.json()['data']['id']
    await _create_book_for_user(reg, BOOK_ID, 'Remove Me')

    # Add first
    await client.post(
        f'/api/v1/collections/{col_id}/books/{BOOK_ID}',
        headers=headers,
    )

    # Remove
    resp = await client.delete(
        f'/api/v1/collections/{col_id}/books/{BOOK_ID}',
        headers=headers,
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_remove_single_book_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.delete(
        f'/api/v1/collections/{FAKE_UUID}/books/{BOOK_ID}',
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
    await _create_book_for_user(reg, BOOK_ID, 'Book 1')
    await _create_book_for_user(reg, BOOK_ID_2, 'Book 2')

    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'BatchRm'},
    )
    col_id = create.json()['data']['id']

    # Add books first
    await client.post(
        f'/api/v1/collections/{col_id}/books',
        headers=headers,
        json={'bookIds': [BOOK_ID, BOOK_ID_2]},
    )

    # Remove batch
    resp = await client.post(
        f'/api/v1/collections/{col_id}/books/remove',
        headers=headers,
        json={'bookIds': [BOOK_ID]},
    )
    assert resp.status_code == 200
    assert BOOK_ID not in resp.json()['data']['bookIds']
    assert BOOK_ID_2 in resp.json()['data']['bookIds']


@pytest.mark.asyncio
async def test_remove_books_batch_returns_404(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.post(
        f'/api/v1/collections/{FAKE_UUID}/books/remove',
        headers=headers,
        json={'bookIds': [BOOK_ID]},
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


# ---------------------------------------------------------------------------
# XSS sanitization on user-text fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_collection_strips_html(client):
    """POST /collections/ must sanitize name/description/icon/color."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    resp = await client.post(
        '/api/v1/collections/',
        headers=headers,
        json={
            'name': '<script>alert(1)</script>My List',
            'description': '<b>desc</b>',
            'icon': '<img>x',
            'color': '<b>red',
        },
    )
    assert resp.status_code == 201
    data = resp.json()['data']
    assert '<' not in data['name'] and '>' not in data['name']
    assert 'My List' in data['name']
    assert '<' not in data['description']
    assert '<' not in data['icon']
    assert '<' not in data['color']


@pytest.mark.asyncio
async def test_update_collection_strips_html(client):
    """PATCH /collections/{id} must sanitize like POST does."""
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    create = await client.post(
        '/api/v1/collections/', headers=headers, json={'name': 'Old'},
    )
    col_id = create.json()['data']['id']

    resp = await client.patch(
        f'/api/v1/collections/{col_id}',
        headers=headers,
        json={
            'name': '<script>x</script>New',
            'description': '<i>desc</i>',
            'icon': '<b>icon</b>',
            'color': '<a>red',
        },
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert '<' not in data['name'] and '>' not in data['name']
    assert 'New' in data['name']
    assert '<' not in data['description']
    assert '<' not in data['icon']
    assert '<' not in data['color']
