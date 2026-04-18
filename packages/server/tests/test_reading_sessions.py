"""Tests for reading session endpoints — CRUD, stats, heartbeat, aliases."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_book(client, token, **overrides):
    """Create a book and return response JSON."""
    payload = {
        'title': 'Session Test Book',
        'author': 'Test Author',
        'file_type': 'epub',
        'file_size': 1024,
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


async def _create_session(client, token, book_id):
    """Create a reading session and return response JSON."""
    resp = await client.post(
        '/api/v1/sessions/',
        json={'book_id': book_id},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, f'Session creation failed: {resp.text}'
    return resp.json()['data']


# ---------------------------------------------------------------------------
# POST /api/v1/sessions/ — create session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    session = await _create_session(client, reg['token'], book['id'])

    assert session['book_id'] == book['id']
    assert session['is_active'] is True
    assert session['started_at'] is not None
    assert session['ended_at'] is None


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/ — list sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    await _create_session(client, reg['token'], book['id'])

    resp = await client.get('/api/v1/sessions/', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert body['total'] >= 1
    assert len(body['data']) >= 1


@pytest.mark.asyncio
async def test_list_sessions_with_book_filter(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book_a = await _create_book(client, reg['token'], title='Book A')
    book_b = await _create_book(client, reg['token'], title='Book B')
    await _create_session(client, reg['token'], book_a['id'])
    await _create_session(client, reg['token'], book_b['id'])

    resp = await client.get(
        f"/api/v1/sessions/?book_id={book_a['id']}",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['total'] == 1
    assert body['data'][0]['book_id'] == book_a['id']


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/active — active session for a book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_active_session_returns_none_when_no_active(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.get(
        f"/api/v1/sessions/active?book_id={book['id']}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()['data'] is None


@pytest.mark.asyncio
async def test_get_active_session_returns_session(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    session = await _create_session(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/sessions/active?book_id={book['id']}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()['data']
    assert data is not None
    assert data['id'] == session['id']


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/stats — aggregate stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_session_stats(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/sessions/stats', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    stats = body['data']
    assert 'total_sessions' in stats
    assert 'total_duration' in stats
    assert 'total_pages_read' in stats


# ---------------------------------------------------------------------------
# PATCH /api/v1/sessions/{session_id}/end — end a session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_end_session(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    session = await _create_session(client, reg['token'], book['id'])

    resp = await client.patch(
        f"/api/v1/sessions/{session['id']}/end",
        headers=headers,
    )
    assert resp.status_code == 200

    data = resp.json()['data']
    assert data['is_active'] is False
    assert data['ended_at'] is not None


# ---------------------------------------------------------------------------
# POST /api/v1/sessions/start — camelCase alias
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_session_with_bookId(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        '/api/v1/sessions/start',
        json={'bookId': book['id']},
        headers=headers,
    )
    assert resp.status_code == 201

    data = resp.json()['data']
    assert data['book_id'] == book['id']
    assert data['is_active'] is True


@pytest.mark.asyncio
async def test_start_session_with_book_id_snake(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        '/api/v1/sessions/start',
        json={'book_id': book['id']},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()['data']['book_id'] == book['id']


# ---------------------------------------------------------------------------
# POST/PATCH /api/v1/sessions/{session_id}/heartbeat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_heartbeat_session(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    session = await _create_session(client, reg['token'], book['id'])

    resp = await client.post(
        f"/api/v1/sessions/{session['id']}/heartbeat",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()['success'] is True


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/book/{book_id}/log — sessions for a book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_book_session_log(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    await _create_session(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/sessions/book/{book['id']}/log",
        headers=headers,
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert body['total'] >= 1
    assert len(body['data']) >= 1


# ---------------------------------------------------------------------------
# GET /api/v1/sessions/{session_id} — single session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/sessions/00000000-0000-0000-0000-000000000000',
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_session_by_id(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    session = await _create_session(client, reg['token'], book['id'])

    resp = await client.get(
        f"/api/v1/sessions/{session['id']}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()['data']['id'] == session['id']
