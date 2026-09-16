"""D1 — Sequence numbers (id: lines) on SSE chunks.

The ``id: {request_id}:{seq}\\n`` prefix on each ``data:`` line is what
makes Last-Event-ID reconnect work — the client stores the last id it
saw and replays it via the ``Last-Event-ID`` HTTP header on reconnect,
letting the server resume from offset (D2 + D3).

Without sequence numbers, a client that disconnects mid-stream and
reconnects would either get duplicate output (server starts from 0
again) or miss the tail (server treats it as a fresh request).

These tests pin:
- ``sse_chunk`` emits ``id:`` line when request_id + seq provided
- ``sse_chunk`` omits ``id:`` line when either is None (backward compat)
- ``sse_metadata_event`` follows the same pattern
- ``_emit_with_seq`` increments counter and persists to replay buffer
- Counter is shared across primary + fallback chunks
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.companion import stream_cache
from app.services.companion import streaming


# ---------------------------------------------------------------------------
# sse_chunk with optional id line
# ---------------------------------------------------------------------------


def test_sse_chunk_emits_id_line_when_request_id_and_seq_provided():
    chunk = stream_cache.sse_chunk('hello', request_id='req-abc', seq=3)
    # Format: 'id: req-abc:3\ndata: {"content": "hello"}\n\n'
    assert chunk.startswith('id: req-abc:3\n')
    assert '"content": "hello"' in chunk
    assert chunk.endswith('\n\n')


def test_sse_chunk_omits_id_line_when_request_id_none():
    """Backward compat — legacy callers (cached response, terminal error
    frames) pass no seq → no id line, same format as before D1."""
    chunk = stream_cache.sse_chunk('hello')
    assert not chunk.startswith('id:')
    assert chunk == f'data: {json.dumps({"content": "hello"})}\n\n'


def test_sse_chunk_omits_id_line_when_seq_none():
    """One of (request_id, seq) is None → no id line. Symmetric with above
    so a caller can't accidentally get a half-tagged frame."""
    chunk = stream_cache.sse_chunk('hello', request_id='req-abc')
    assert not chunk.startswith('id:')


def test_sse_chunk_id_line_is_parseable_by_sse_spec():
    """The id line precedes the data line; both are spec-compliant.
    The chunk must round-trip through an SSE parser that splits on \\n\\n
    and reads ``id:`` / ``data:`` prefixes."""
    chunk = stream_cache.sse_chunk('hi', request_id='req-1', seq=0)
    # Split on \n\n — exactly one frame.
    frames = chunk.split('\n\n')
    assert len(frames) == 2  # frame + trailing empty
    frame = frames[0]
    lines = frame.split('\n')
    assert lines[0] == 'id: req-1:0'
    assert lines[1].startswith('data: ')


# ---------------------------------------------------------------------------
# sse_metadata_event with optional id line
# ---------------------------------------------------------------------------


def test_sse_metadata_event_emits_id_line_when_seq_provided():
    chunk = stream_cache.sse_metadata_event(
        request_id='req-abc', model='glm-flash',
        fallback_used=True, primary_model='gpt-4.1-nano', seq=2,
    )
    assert chunk.startswith('id: req-abc:2\n')
    assert '"type": "metadata"' in chunk


def test_sse_metadata_event_omits_id_line_when_seq_none():
    chunk = stream_cache.sse_metadata_event(
        request_id='req-abc', model='glm-flash', fallback_used=True,
    )
    assert not chunk.startswith('id:')


# ---------------------------------------------------------------------------
# _emit_with_seq helper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_emit_with_seq_increments_counter():
    """Each call must increment seq_state[0] so successive chunks get
    distinct sequence numbers."""
    state = [0]
    with patch('app.services.companion.stream_replay.append_chunk', new=AsyncMock()):
        chunk1 = await streaming._emit_with_seq('a', 'req-1', state)
        chunk2 = await streaming._emit_with_seq('b', 'req-1', state)

    assert state[0] == 2
    assert 'id: req-1:1\n' in chunk1
    assert 'id: req-1:2\n' in chunk2


@pytest.mark.asyncio
async def test_emit_with_seq_persists_to_replay_buffer():
    """D2 wiring — each emitted chunk must be appended to the Redis replay
    buffer so D3 reconnect can resume."""
    state = [0]
    with patch(
        'app.services.companion.stream_replay.append_chunk', new=AsyncMock(),
    ) as mock_append:
        chunk = await streaming._emit_with_seq('hello', 'req-1', state)

    mock_append.assert_awaited_once()
    call_args = mock_append.call_args
    assert call_args.args[0] == 'req-1'  # request_id
    assert call_args.args[1] == 1  # seq
    assert call_args.args[2] == chunk  # the exact emitted chunk


@pytest.mark.asyncio
async def test_emit_with_seq_falls_back_when_seq_state_none():
    """Terminal / error frames pass seq_state=None → no id line, no replay
    append. Backward compat preserved."""
    with patch(
        'app.services.companion.stream_replay.append_chunk', new=AsyncMock(),
    ) as mock_append:
        chunk = await streaming._emit_with_seq('terminal', 'req-1', None)

    assert not chunk.startswith('id:')
    mock_append.assert_not_awaited()


# ---------------------------------------------------------------------------
# _emit_metadata_with_seq helper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_emit_metadata_with_seq_increments_counter():
    state = [5]
    with patch('app.services.companion.stream_replay.append_chunk', new=AsyncMock()):
        chunk = await streaming._emit_metadata_with_seq(
            request_id='req-1', model='glm', fallback_used=True,
            primary_model='gpt', seq_state=state,
        )
    assert state[0] == 6
    assert 'id: req-1:6\n' in chunk
    assert '"type": "metadata"' in chunk


# ---------------------------------------------------------------------------
# Counter shared across primary + fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_counter_continues_across_primary_and_fallback():
    """When primary emits chunks 1..N then fails, fallback must continue
    from N+1 — not reset to 0. Without this, a reconnect after fallback
    would see duplicate seq numbers and replay would be ambiguous."""
    from app.services.companion import stream_fallback

    state = [10]
    # Simulate primary emitting one chunk via _emit_with_seq, then
    # fallback emitting one chunk via _emit_fallback_with_seq.
    with patch('app.services.companion.stream_replay.append_chunk', new=AsyncMock()):
        primary_chunk = await streaming._emit_with_seq('primary', 'req-1', state)
        fallback_chunk = await stream_fallback._emit_fallback_with_seq(
            'fallback', 'req-1', state,
        )

    # Same state object mutated by both helpers.
    assert state[0] == 12
    assert 'id: req-1:11\n' in primary_chunk
    assert 'id: req-1:12\n' in fallback_chunk
