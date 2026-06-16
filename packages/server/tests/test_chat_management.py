"""Tests for chat management features (P0/P1 task):

- POST /api/v1/agent/chat/cancel (cooperative cancel by request_id)
- GET /api/v1/agent/history with cursor pagination (before=)
- POST /api/v1/agent/chat/regenerate (soft-delete + re-stream)
- AIFeedback CASCADE delete when ChatMessage is hard-deleted
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID
import hashlib

import pytest
from sqlalchemy import select

from app.models.ai_feedback import AIFeedback
from app.models.chat_message import ChatMessage
from tests.conftest import _TestSession, auth_headers, register_user


async def _create_book(client, token, **overrides):
    payload = {
        'title': 'The Great Gatsby',
        'author': 'F. Scott Fitzgerald',
        'file_type': 'epub',
        'file_size': 2048,
        'total_pages': 180,
        **overrides,
    }
    resp = await client.post('/api/v1/books', json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()['data']


def _mock_llm_response(content: str = 'Mock AI response.'):
    mock = AsyncMock()
    mock.content = content
    return mock


async def _seed_message(
    user_id, book_id, role, content, *, deleted_at=None, created_at=None,
):
    """Insert a ChatMessage directly via ORM and return the row."""
    async with _TestSession() as db:
        m = ChatMessage(
            user_id=user_id,
            book_id=book_id,
            role=role,
            content=content,
            content_hash=hashlib.md5(content[:500].encode('utf-8')).hexdigest(),
            deleted_at=deleted_at,
            created_at=created_at or datetime.now(timezone.utc),
        )
        db.add(m)
        await db.commit()
        await db.refresh(m)
        return m


# ---------------------------------------------------------------------------
# POST /chat/cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_unknown_request_id_returns_cancelled_false(client):
    """Cancelling an unknown request_id should return 200 with cancelled: false
    (not 404) — it is a cooperative best-effort signal."""
    reg = await register_user(client)
    resp = await client.post(
        '/api/v1/agent/chat/cancel',
        json={'request_id': 'deadbeefdeadbeefdeadbeefdeadbeef'},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert body['data']['cancelled'] is False


@pytest.mark.asyncio
async def test_cancel_validates_request_id_length(client):
    """request_id is constrained to 4..64 chars by the Pydantic schema."""
    reg = await register_user(client)
    # Too short
    resp = await client.post(
        '/api/v1/agent/chat/cancel',
        json={'request_id': 'ab'},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 422
    # Too long
    resp = await client.post(
        '/api/v1/agent/chat/cancel',
        json={'request_id': 'x' * 100},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /history with cursor pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_returns_flat_list_without_before(client):
    """No `before` param → backwards-compatible flat list (no nextCursor key)."""
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    resp = await client.get(
        f"/api/v1/agent/history?book_id={book['id']}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], list)
    # Flat list — nextCursor must NOT be present (backwards-compat).
    assert 'nextCursor' not in body


@pytest.mark.asyncio
async def test_history_returns_paginated_shape_with_before(client):
    """With `before` param → {items, nextCursor} shape."""
    reg = await register_user(client)
    user_id = UUID(reg['user']['id'])
    book_id = UUID((await _create_book(client, reg['token']))['id'])

    # Insert 3 messages directly via the ORM with explicit timestamps.
    now = datetime.now(timezone.utc)
    msgs = []
    for i in range(3):
        m = await _seed_message(
            user_id, book_id, 'user' if i % 2 == 0 else 'assistant',
            f'msg-{i}', created_at=now - timedelta(minutes=3 - i),
        )
        msgs.append(m)

    # Use the oldest message id as cursor — there should be nothing older.
    oldest = min(msgs, key=lambda m: m.created_at)
    resp = await client.get(
        f"/api/v1/agent/history?book_id={book_id}&before={oldest.id}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert 'nextCursor' in body
    assert isinstance(body['data'], list)
    # Nothing older than oldest → empty page.
    assert body['data'] == []
    assert body['nextCursor'] is None


@pytest.mark.asyncio
async def test_history_pagination_returns_items_and_cursor(client):
    """Cursor pagination returns older items and a cursor when more exist."""
    reg = await register_user(client)
    user_id = UUID(reg['user']['id'])
    book_id = UUID((await _create_book(client, reg['token']))['id'])

    now = datetime.now(timezone.utc)
    msgs = []
    for i in range(5):
        m = await _seed_message(
            user_id, book_id, 'user' if i % 2 == 0 else 'assistant',
            f'msg-{i}', created_at=now - timedelta(minutes=5 - i),
        )
        msgs.append(m)

    # Cursor at the newest message; fetch limit=2.
    newest = max(msgs, key=lambda m: m.created_at)
    resp = await client.get(
        f"/api/v1/agent/history?book_id={book_id}&before={newest.id}&limit=2",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], list)
    # Should return up to `limit` items older than the cursor.
    assert len(body['data']) <= 2
    # nextCursor should be set because more rows exist.
    assert body['nextCursor'] is not None


# ---------------------------------------------------------------------------
# POST /chat/regenerate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_regenerate_404_when_no_history(client):
    """Regenerate should 404 when there's no user message to regenerate from."""
    reg = await register_user(client)
    book = await _create_book(client, reg['token'])

    resp = await client.post(
        '/api/v1/agent/chat/regenerate',
        json={'book_id': book['id']},
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_regenerate_soft_deletes_last_assistant(client):
    """Regenerate should soft-delete the last assistant message (deleted_at set)."""
    reg = await register_user(client)
    user_id = UUID(reg['user']['id'])
    book_id = UUID((await _create_book(client, reg['token']))['id'])

    # Seed a user+assistant pair directly in the DB.
    user_msg = await _seed_message(user_id, book_id, 'user', 'hello?')
    assistant_msg = await _seed_message(
        user_id, book_id, 'assistant', 'old response',
        created_at=user_msg.created_at + timedelta(seconds=1),
    )
    assistant_id = assistant_msg.id

    # Mock the LLM so the regenerate stream returns successfully.
    mock_response = _mock_llm_response('fresh response')
    with patch('app.services.llm.get_llm') as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = mock_response
        mock_get_llm.return_value = mock_llm

        resp = await client.post(
            '/api/v1/agent/chat/regenerate',
            json={'book_id': str(book_id)},
            headers=auth_headers(reg['token']),
        )

    assert resp.status_code == 200
    # The old assistant message must be soft-deleted.
    async with _TestSession() as db:
        result = await db.execute(
            select(ChatMessage).where(ChatMessage.id == assistant_id)
        )
        row = result.scalar_one_or_none()
        assert row is not None
        assert row.deleted_at is not None


# ---------------------------------------------------------------------------
# AIFeedback CASCADE delete (P0-4)
# ---------------------------------------------------------------------------


def test_ai_feedback_fk_is_cascade():
    """The AIFeedback.message_id FK must be declared with ondelete='CASCADE'.

    Runtime cascade behaviour is enforced by PostgreSQL in production; in
    SQLite tests with FK pragmas off, we verify the schema contract here.
    """
    from app.models.ai_feedback import AIFeedback

    col = AIFeedback.__table__.columns.get('message_id')
    assert col is not None, 'AIFeedback must have message_id column'
    fks = list(col.foreign_keys)
    assert len(fks) == 1, f'message_id should have exactly one FK, got {len(fks)}'
    fk = fks[0]
    # The target table must be chat_messages.
    assert fk.column.table.name == 'chat_messages'
    # ondelete must be CASCADE.
    assert fk.ondelete == 'CASCADE', (
        f'expected CASCADE, got {fk.ondelete!r} — migration 0013 must include '
        'ondelete="CASCADE" on the FK'
    )


def test_ai_feedback_message_id_is_uuid_type():
    """The AIFeedback.message_id column must be UUID (was TEXT pre-migration 0013)."""
    from app.models.ai_feedback import AIFeedback

    col = AIFeedback.__table__.columns.get('message_id')
    assert col is not None
    # UuidType is a TypeDecorator wrapping PG_UUID. Check both the wrapper
    # class name and the underlying impl.
    type_name = type(col.type).__name__.lower()
    impl = getattr(col.type, 'impl', None)
    impl_name = type(impl).__name__.lower() if impl else ''
    assert 'uuid' in type_name or 'uuid' in impl_name, (
        f'expected UUID type, got type={type_name} impl={impl_name}'
    )


# ---------------------------------------------------------------------------
# request_id tracking (P0-3) — agent_service helpers
# ---------------------------------------------------------------------------


def test_new_request_id_is_unique_hex():
    from app.services.agent_service import new_request_id
    a = new_request_id()
    b = new_request_id()
    assert a != b
    # Should be valid hex of reasonable length.
    int(a, 16)
    assert len(a) >= 8


def test_cancel_stream_unknown_returns_false():
    from app.services.agent_service import cancel_stream
    assert cancel_stream('unknown-request-id-zzz') is False


# ---------------------------------------------------------------------------
# Soft-delete filter (regenerate flow)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_excludes_soft_deleted_messages(client):
    """Soft-deleted messages must NOT appear in GET /history."""
    reg = await register_user(client)
    user_id = UUID(reg['user']['id'])
    book_id = UUID((await _create_book(client, reg['token']))['id'])

    now = datetime.now(timezone.utc)
    await _seed_message(user_id, book_id, 'user', 'active', created_at=now)
    await _seed_message(
        user_id, book_id, 'assistant', 'deleted',
        deleted_at=now, created_at=now + timedelta(seconds=1),
    )

    resp = await client.get(
        f"/api/v1/agent/history?book_id={book_id}",
        headers=auth_headers(reg['token']),
    )
    assert resp.status_code == 200
    contents = [m['content'] for m in resp.json()['data']]
    assert 'active' in contents
    assert 'deleted' not in contents
