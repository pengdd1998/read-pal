"""Feedback message-id chain — the real DB id must reach the client.

The rating endpoint FKs message_id against chat_messages.id, but the
client used to hold only its local generateId() placeholder, so every
rating on a fresh streamed reply 500'd (FK violation). The stream now
emits a message_id frame after persist; these tests pin the backend
half of that chain.
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.companion import stream_cache
from app.services.companion.stream_persist import _persist_with_retry


@pytest.mark.asyncio
async def test_persist_stream_result_returns_assistant_id():
    db = AsyncMock()
    with patch.object(stream_cache, '_save_message', new_callable=AsyncMock) as save:
        save.side_effect = [uuid4(), uuid4()]  # user, assistant
        result = await stream_cache.persist_stream_result(
            db, uuid4(), uuid4(), 'msg', [], ['hello'], 'req-1',
        )
    assert isinstance(result, __import__('uuid').UUID), (
        'persist_stream_result must return the assistant message id'
    )
    assert save.await_count == 2


@pytest.mark.asyncio
async def test_persist_stream_result_empty_returns_none():
    db = AsyncMock()
    with patch.object(stream_cache, '_save_message', new_callable=AsyncMock):
        result = await stream_cache.persist_stream_result(
            db, uuid4(), uuid4(), 'msg', [], [], 'req-1',  # nothing collected
        )
    assert result is None


@pytest.mark.asyncio
async def test_persist_with_retry_returns_id():
    db = AsyncMock()
    expected = uuid4()
    with patch('app.services.companion.stream_persist.persist_stream_result',
               new=AsyncMock(return_value=expected)):
        result = await _persist_with_retry(
            db, uuid4(), uuid4(), 'msg', [], ['hello'], 'req-1',
        )
    assert result == expected
