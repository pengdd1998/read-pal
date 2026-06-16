"""D2 — Redis-backed chunk buffer for SSE stream replay.

When a client disconnects mid-stream and reconnects with ``Last-Event-ID``
(D1 + D4), the server needs the chunks already emitted to replay from
offset. This module persists chunks to a Redis list keyed by request_id,
capped at ``MAX_CHUNKS_PER_REQUEST`` to bound memory under heavy traffic.

These tests pin:
- Append stores seq + chunk with newline separator
- get_chunks_after filters by seq strictly (only > last_seq)
- TTL is refreshed on every append
- Cap drops oldest entries when exceeded (FIFO)
- Redis-down on append is silent (stream still works)
- Redis-down on read returns empty list (reconnect falls back gracefully)
- buffer_exists distinguishes reconnect from fresh request
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.companion import stream_replay


# ---------------------------------------------------------------------------
# Fake Redis that supports RPUSH / EXPIRE / LRANGE / LLEN / LTRIM / EXISTS
# ---------------------------------------------------------------------------


class _FakeRedis:
    """Minimal fake Redis supporting the ops stream_replay needs."""

    def __init__(self) -> None:
        self.lists: dict[str, list[str]] = {}
        self.ttl: dict[str, int] = {}
        # Call counters for assertions.
        self.rpush_calls = 0
        self.expire_calls = 0
        self.ltrim_calls = 0

    async def rpush(self, key: str, value: str) -> int:
        self.rpush_calls += 1
        self.lists.setdefault(key, []).append(value)
        return len(self.lists[key])

    async def expire(self, key: str, ttl: int) -> bool:
        self.expire_calls += 1
        self.ttl[key] = ttl
        return True

    async def llen(self, key: str) -> int:
        return len(self.lists.get(key, []))

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        self.ltrim_calls += 1
        items = self.lists.get(key, [])
        # Redis semantics: stop=-1 means end of list.
        if stop == -1:
            self.lists[key] = items[start:]
        else:
            self.lists[key] = items[start:stop + 1]
        return True

    async def lrange(self, key: str, start: int, stop: int) -> list[str]:
        items = self.lists.get(key, [])
        if stop == -1:
            return items[start:]
        return items[start:stop + 1]

    async def exists(self, key: str) -> int:
        return 1 if key in self.lists else 0


# ---------------------------------------------------------------------------
# Append
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_stores_seq_and_chunk_with_newline_separator():
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        await stream_replay.append_chunk('req-1', 0, 'data: {"content":"hi"}\n\n')

    key = stream_replay._key('req-1')
    assert fake.lists[key] == ['0\ndata: {"content":"hi"}\n\n']


@pytest.mark.asyncio
async def test_append_refreshes_ttl_each_call():
    """TTL must be set on every append so the buffer doesn't expire mid-
    stream when a long response writes chunks for > 10 min."""
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        await stream_replay.append_chunk('req-1', 0, 'chunk-0')
        await stream_replay.append_chunk('req-1', 1, 'chunk-1')

    assert fake.expire_calls == 2
    assert fake.ttl[stream_replay._key('req-1')] == stream_replay.REPLAY_TTL_SECONDS


@pytest.mark.asyncio
async def test_append_handles_chunk_with_embedded_newlines():
    """SSE frames can span multiple lines (id: ... \\n data: ...). The
    encoder must use a one-shot separator so chunks parse cleanly."""
    fake = _FakeRedis()
    multi_line_chunk = 'id: req-1:5\ndata: {"content":"line1\\nline2"}\n\n'
    with patch('app.core.redis.get_redis', return_value=fake):
        await stream_replay.append_chunk('req-1', 5, multi_line_chunk)

    # Round-trip: get_chunks_after should recover the original chunk.
    with patch('app.core.redis.get_redis', return_value=fake):
        result = await stream_replay.get_chunks_after('req-1', 4)
    assert result == [(5, multi_line_chunk)]


# ---------------------------------------------------------------------------
# get_chunks_after
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_chunks_after_returns_only_chunks_after_last_seq():
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        for seq in range(5):
            await stream_replay.append_chunk('req-1', seq, f'chunk-{seq}')
        result = await stream_replay.get_chunks_after('req-1', 2)

    assert [seq for seq, _ in result] == [3, 4]
    assert [chunk for _, chunk in result] == ['chunk-3', 'chunk-4']


@pytest.mark.asyncio
async def test_get_chunks_after_returns_empty_when_buffer_missing():
    """Reconnect for an unknown / expired request_id → empty list (caller
    falls back to fresh-request semantics)."""
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        result = await stream_replay.get_chunks_after('never-existed', 0)

    assert result == []


@pytest.mark.asyncio
async def test_get_chunks_after_returns_empty_when_all_chunks_le_last_seq():
    """Client already saw everything (Last-Event-ID == final seq)."""
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        for seq in range(3):
            await stream_replay.append_chunk('req-1', seq, f'chunk-{seq}')
        result = await stream_replay.get_chunks_after('req-1', 99)

    assert result == []


# ---------------------------------------------------------------------------
# Cap enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cap_drops_oldest_chunks_when_exceeded():
    """Beyond MAX_CHUNKS_PER_REQUEST, oldest chunks are dropped (FIFO).
    Reconnect would miss the very start of pathological token-by-token
    streams, but the alternative is unbounded Redis memory."""
    fake = _FakeRedis()
    # Pre-shrink the cap so the test runs fast.
    with patch.object(stream_replay, 'MAX_CHUNKS_PER_REQUEST', 5), \
         patch('app.core.redis.get_redis', return_value=fake):
        for seq in range(10):
            await stream_replay.append_chunk('req-1', seq, f'chunk-{seq}')

    key = stream_replay._key('req-1')
    # Only the last 5 chunks should remain.
    assert len(fake.lists[key]) == 5
    # And LTRIM should have been called.
    assert fake.ltrim_calls > 0


# ---------------------------------------------------------------------------
# Failure modes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_silent_on_redis_error():
    """Redis-down on append must not break the stream — replay is a
    secondary feature, the live stream is the primary."""
    broken = MagicMock()
    broken.rpush = AsyncMock(side_effect=ConnectionError('redis down'))

    with patch('app.core.redis.get_redis', return_value=broken):
        # Should complete without raising.
        await stream_replay.append_chunk('req-1', 0, 'chunk-0')


@pytest.mark.asyncio
async def test_get_chunks_after_returns_empty_on_redis_error():
    broken = MagicMock()
    broken.lrange = AsyncMock(side_effect=ConnectionError('redis down'))

    with patch('app.core.redis.get_redis', return_value=broken):
        result = await stream_replay.get_chunks_after('req-1', 0)

    assert result == [], 'Redis error must degrade to empty list, not raise'


# ---------------------------------------------------------------------------
# buffer_exists
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_buffer_exists_returns_true_when_present():
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        await stream_replay.append_chunk('req-1', 0, 'chunk-0')
        assert await stream_replay.buffer_exists('req-1') is True


@pytest.mark.asyncio
async def test_buffer_exists_returns_false_when_missing():
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake):
        assert await stream_replay.buffer_exists('never-existed') is False


@pytest.mark.asyncio
async def test_buffer_exists_returns_false_on_redis_error():
    """Redis-down must not 500 the reconnect probe."""
    broken = MagicMock()
    broken.exists = AsyncMock(side_effect=ConnectionError('redis down'))

    with patch('app.core.redis.get_redis', return_value=broken):
        assert await stream_replay.buffer_exists('req-1') is False
