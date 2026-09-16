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

    assert session['bookId'] == book['id']
    assert session['isActive'] is True
    assert session['startedAt'] is not None
    assert session['endedAt'] is None


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
    assert body['data'][0]['bookId'] == book_a['id']


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
    assert 'totalSessions' in stats
    assert 'totalDuration' in stats
    assert 'totalPagesRead' in stats
    assert 'totalHighlights' in stats
    assert 'totalNotes' in stats


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
    assert data['isActive'] is False
    assert data['endedAt'] is not None


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
    assert data['bookId'] == book['id']
    assert data['isActive'] is True


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
    assert resp.json()['data']['bookId'] == book['id']


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
    # Pagination metadata
    assert body['page'] == 1
    assert body['perPage'] == 50
    assert body['hasMore'] is False


@pytest.mark.asyncio
async def test_get_book_session_log_pagination(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])
    book = await _create_book(client, reg['token'])
    # Create 3 sessions
    for _ in range(3):
        await _create_session(client, reg['token'], book['id'])

    # Page 1, per_page=2 — should have has_more=True
    resp = await client.get(
        f"/api/v1/sessions/book/{book['id']}/log?page=1&per_page=2",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['total'] == 3
    assert body['page'] == 1
    assert body['perPage'] == 2
    assert len(body['data']) == 2
    assert body['hasMore'] is True

    # Page 2, per_page=2 — should have hasMore=False
    resp2 = await client.get(
        f"/api/v1/sessions/book/{book['id']}/log?page=2&per_page=2",
        headers=headers,
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2['page'] == 2
    assert len(body2['data']) == 1
    assert body2['hasMore'] is False


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


# ---------------------------------------------------------------------------
# Stale session duration: idle tabs must not inflate duration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stale_session_duration_capped_to_last_heartbeat(client):
    """A stale session left open for hours should not accrue hours of duration.

    The user reads for ~1 minute (last heartbeat shortly after start), leaves
    the tab open for hours, then opens the book again. The first session is
    closed stale — its duration must reflect ~1 minute of activity, not the
    5-hour wall-clock window.
    """
    from datetime import UTC, datetime, timedelta

    from app.models.book import Book
    from app.models.reading_session import ReadingSession
    from app.models.user import User
    from app.services.reading_session_service import (
        STALE_IDLE_GRACE_SECONDS,
        _close_stale_sessions,
    )
    from tests.conftest import _TestSession

    reg = await register_user(client)

    async with _TestSession() as db:
        # Fetch user and create book directly
        from sqlalchemy import select

        user = (await db.execute(
            select(User).where(User.id == reg['user']['id'])
        )).scalar_one()
        book = Book(
            user_id=user.id,
            title='Stale Test',
            author='A',
            file_type='epub',
            file_size=1024,
            total_pages=100,
        )
        db.add(book)
        await db.flush()

        # Session: started 5h ago, last heartbeat 4h59m ago (1 min of reading).
        # Aware UTC throughout — reading_sessions columns are timestamptz
        # (PG loads aware); the service normalizes naive inputs to aware.
        started = datetime.now(UTC) - timedelta(hours=5)
        last_heartbeat = started + timedelta(seconds=60)
        stale = ReadingSession(
            user_id=user.id,
            book_id=book.id,
            started_at=started,
            updated_at=last_heartbeat,
            is_active=True,
        )
        db.add(stale)
        await db.flush()

        now = datetime.now(UTC)
        # Pre-fetch the stale row so we can read mutations after close.
        pre_close = (
            await db.execute(
                select(ReadingSession).where(
                    ReadingSession.user_id == user.id,
                    ReadingSession.book_id == book.id,
                    ReadingSession.is_active.is_(True),
                )
            )
        ).scalars().all()
        assert len(pre_close) == 1, 'Stale session should be queryable'
        await _close_stale_sessions(db, str(user.id), book.id, now)
        # _close_stale_sessions mutates in-place but doesn't flush — read from
        # the in-memory instance we already had, no refresh.
        closed = pre_close[0]

        expected_end = last_heartbeat + timedelta(seconds=STALE_IDLE_GRACE_SECONDS)
        assert closed.ended_at is not None
        # ended_at should be near last_heartbeat + grace, NOT now (5h later)
        delta_to_now = abs((now - closed.ended_at).total_seconds())
        delta_to_expected = abs((closed.ended_at - expected_end).total_seconds())
        assert delta_to_expected < delta_to_now, (
            f'Stale end should be near last_heartbeat + grace, not current time. '
            f'got ended_at={closed.ended_at}, expected~{expected_end}, now={now}'
        )

        # Duration: ~1 min reading + 5 min grace = ~6 min, NOT 5 hours
        assert closed.duration <= 600, f'Duration should be bounded, got {closed.duration}s'
        assert closed.duration > 0


