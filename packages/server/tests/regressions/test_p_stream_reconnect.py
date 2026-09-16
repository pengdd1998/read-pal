"""D3 — Reconnect endpoint logic via ``Last-Event-ID`` header.

When a client disconnects mid-stream and reconnects (D1 + D2 + D4 in
place), the server should replay buffered chunks from the offset the
client last saw — not start over and not return ALREADY_COMPLETED.

These tests pin:
- ``parse_last_event_id`` round-trips D1's ``{request_id}:{seq}`` format
- ``parse_last_event_id`` rejects malformed headers (no colon, non-int seq)
- ``try_buffered_replay`` returns None when buffer missing → caller falls
  through to fresh stream
- ``try_buffered_replay`` returns buffered chunks when buffer exists
- ``try_buffered_replay`` returns empty list when Last-Event-ID == final seq
  (client already saw everything)
- ``_idempotent_stream_impl`` bypasses the 409 raise when Last-Event-ID is
  present, so the handler can serve buffered replay
- ``/chat/stream`` handler returns a StreamingResponse emitting buffered
  chunks + ``[DONE]`` when Last-Event-ID resolves to a live buffer
- ``/chat/stream`` handler falls through to fresh stream when buffer missing
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.companion import stream_replay


# ---------------------------------------------------------------------------
# parse_last_event_id
# ---------------------------------------------------------------------------


def test_parse_last_event_id_round_trips_d1_format():
    """D1 emits ``id: {request_id}:{seq}\\n`` — the value carried by
    Last-Event-ID on reconnect. Parser must recover both fields."""
    result = stream_replay.parse_last_event_id('req_abc:7')
    assert result == ('req_abc', 7)


def test_parse_last_event_id_returns_none_when_header_absent():
    assert stream_replay.parse_last_event_id(None) is None
    assert stream_replay.parse_last_event_id('') is None


def test_parse_last_event_id_returns_none_when_no_colon():
    """Header without colon can't be a D1 id — must be malformed."""
    assert stream_replay.parse_last_event_id('just-a-key') is None


def test_parse_last_event_id_returns_none_when_seq_not_int():
    """Seq must be parseable as int. Otherwise client is sending garbage
    (or D1 format changed) — caller falls back to fresh request."""
    assert stream_replay.parse_last_event_id('req_abc:abc') is None


def test_parse_last_event_id_returns_none_when_request_id_empty():
    """:7 has no request_id — would never match a buffer key."""
    assert stream_replay.parse_last_event_id(':7') is None


def test_parse_last_event_id_rejects_negative_seq():
    """Negative seq would never come from D1's counter (starts at 1)."""
    assert stream_replay.parse_last_event_id('req_abc:-1') is None


def test_parse_last_event_id_handles_zero_seq():
    """seq=0 is valid (the very first chunk) — replays everything."""
    result = stream_replay.parse_last_event_id('req_abc:0')
    assert result == ('req_abc', 0)


# ---------------------------------------------------------------------------
# try_buffered_replay
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_try_buffered_replay_returns_none_for_malformed_header():
    """Garbage header → fall through to fresh stream."""
    result = await stream_replay.try_buffered_replay('garbage')
    assert result is None


@pytest.mark.asyncio
async def test_try_buffered_replay_returns_none_when_buffer_missing():
    """Header parses but buffer doesn't exist (expired / never written).
    Caller must fall through — never 500."""
    with patch('app.services.companion.stream_replay.buffer_exists', new=AsyncMock(return_value=False)):
        result = await stream_replay.try_buffered_replay('req_abc:5')
    assert result is None


@pytest.mark.asyncio
async def test_try_buffered_replay_returns_buffered_chunks_when_buffer_exists():
    """Happy path: header parses, buffer exists, get_chunks_after returns
    the chunks after the client's last seen seq."""
    chunks = [(6, 'data: {"content":"c6"}\n\n'), (7, 'data: {"content":"c7"}\n\n')]
    with patch('app.services.companion.stream_replay.buffer_exists', new=AsyncMock(return_value=True)), \
         patch('app.services.companion.stream_replay.get_chunks_after', new=AsyncMock(return_value=chunks)):
        result = await stream_replay.try_buffered_replay('req_abc:5')
    assert result == chunks


@pytest.mark.asyncio
async def test_try_buffered_replay_returns_empty_list_when_client_already_caught_up():
    """Last-Event-ID == final seq → no new chunks. Caller emits just [DONE]
    so the client knows the stream is complete without re-receiving anything."""
    with patch('app.services.companion.stream_replay.buffer_exists', new=AsyncMock(return_value=True)), \
         patch('app.services.companion.stream_replay.get_chunks_after', new=AsyncMock(return_value=[])):
        result = await stream_replay.try_buffered_replay('req_abc:99')
    # Empty list, NOT None — distinguish from "buffer missing".
    assert result == []


# ---------------------------------------------------------------------------
# _idempotent_stream_impl bypass for Last-Event-ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_idempotent_stream_impl_bypasses_raise_when_last_event_id_present():
    """Reconnect requests carry Last-Event-ID — the dependency must NOT
    raise 409 ALREADY_COMPLETED even when the original stream completed,
    so the handler can serve buffered replay chunks."""
    from app.middleware.idempotency import _idempotent_stream_impl

    # mark_processing returns False (this is a replay). Without the bypass,
    # the dependency would raise 409. With the bypass, it returns None.
    fake_store = MagicMock()
    fake_store.mark_processing = AsyncMock(return_value=False)
    fake_store.get_cached_response = AsyncMock(return_value={'_stream_completed': True})

    fake_request = MagicMock()
    fake_request.headers = {'last-event-id': 'req_abc:5'}

    fake_user = {'id': 'user-1'}

    with patch('app.middleware.idempotency._get_store', return_value=fake_store), \
         patch('app.middleware.idempotency._validate_key', side_effect=lambda k: k or 'fallback-key'):
        # Should NOT raise — bypass returns None.
        result = await _idempotent_stream_impl(
            request=fake_request,
            idempotency_key='original-key',
            user=fake_user,
        )

    assert result is None


@pytest.mark.asyncio
async def test_idempotent_stream_impl_still_raises_when_no_last_event_id():
    """Sanity: without Last-Event-ID, the 409 ALREADY_COMPLETED raise
    still fires (the bypass is reconnect-specific, not unconditional)."""
    from fastapi import HTTPException

    from app.middleware.idempotency import _idempotent_stream_impl

    fake_store = MagicMock()
    fake_store.mark_processing = AsyncMock(return_value=False)
    fake_store.get_cached_response = AsyncMock(return_value={'_stream_completed': True})

    fake_request = MagicMock()
    fake_request.headers = {}  # No Last-Event-ID.

    fake_user = {'id': 'user-1'}

    with patch('app.middleware.idempotency._get_store', return_value=fake_store), \
         patch('app.middleware.idempotency._validate_key', side_effect=lambda k: k or 'fallback-key'):
        with pytest.raises(HTTPException) as exc_info:
            await _idempotent_stream_impl(
                request=fake_request,
                idempotency_key='original-key',
                user=fake_user,
            )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail['code'] == 'ALREADY_COMPLETED'


# ---------------------------------------------------------------------------
# /chat/stream handler end-to-end (replay path)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_stream_returns_replay_when_buffer_exists():
    """End-to-end: when Last-Event-ID resolves to a live buffer, the
    handler returns a StreamingResponse that emits each buffered chunk
    then ``data: [DONE]\\n\\n``."""
    from fastapi.responses import StreamingResponse

    from app.routers.agent import stream

    chunks = [
        (6, 'id: req_abc:6\ndata: {"content":"c6"}\n\n'),
        (7, 'id: req_abc:7\ndata: {"content":"c7"}\n\n'),
    ]

    fake_request = MagicMock()
    fake_request.headers = {'last-event-id': 'req_abc:5'}

    body = MagicMock()
    body.book_id = '00000000-0000-0000-0000-000000000001'
    body.message = 'irrelevant-on-replay'
    body.context = None
    body.persona = None
    body.genre = None

    with patch('app.services.companion.stream_replay.try_buffered_replay', new=AsyncMock(return_value=chunks)):
        response = await stream(
            request=fake_request,
            body=body,
            current_user={'id': '00000000-0000-0000-0000-000000000002'},
            db=MagicMock(),
        )

    assert isinstance(response, StreamingResponse)
    # Consume the generator.
    collected = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            collected.append(chunk.decode('utf-8'))
        else:
            collected.append(chunk)
    joined = ''.join(collected)
    assert 'id: req_abc:6\n' in joined
    assert 'id: req_abc:7\n' in joined
    assert joined.endswith('data: [DONE]\n\n')


@pytest.mark.asyncio
async def test_chat_stream_emits_only_done_when_buffer_empty():
    """Client's Last-Event-ID == final seq → empty buffer list → emit just
    ``[DONE]`` so the client knows the stream is complete."""
    from fastapi.responses import StreamingResponse

    from app.routers.agent import stream

    fake_request = MagicMock()
    fake_request.headers = {'last-event-id': 'req_abc:99'}

    body = MagicMock()
    body.book_id = '00000000-0000-0000-0000-000000000001'
    body.message = 'irrelevant'
    body.context = None
    body.persona = None
    body.genre = None

    with patch('app.services.companion.stream_replay.try_buffered_replay', new=AsyncMock(return_value=[])):
        response = await stream(
            request=fake_request,
            body=body,
            current_user={'id': '00000000-0000-0000-0000-000000000002'},
            db=MagicMock(),
        )

    assert isinstance(response, StreamingResponse)
    collected = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            collected.append(chunk.decode('utf-8'))
        else:
            collected.append(chunk)
    joined = ''.join(collected)
    assert joined == 'data: [DONE]\n\n'


@pytest.mark.asyncio
async def test_chat_stream_falls_through_when_buffer_missing():
    """Reconnect attempted but buffer expired → fall through to fresh stream.
    The fresh stream path generates a new request_id and dispatches
    ``sse_bytes_stream`` — verified by mocking that helper."""
    from fastapi.responses import StreamingResponse

    from app.routers.agent import stream

    async def _fake_sse_bytes_stream(*args, **kwargs):
        # The fresh-stream path was reached (not the replay path).
        yield b'data: {"request_id":"new-id"}\n\n'
        yield b'data: [DONE]\n\n'

    fake_request = MagicMock()
    fake_request.headers = {'last-event-id': 'req_abc:5'}

    body = MagicMock()
    body.book_id = '00000000-0000-0000-0000-000000000001'
    body.message = 'hi'
    body.context = {'companionMode': 'casual'}
    body.persona = None
    body.genre = None

    with patch('app.services.companion.stream_replay.try_buffered_replay', new=AsyncMock(return_value=None)), \
         patch('app.routers.agent.sse_bytes_stream', side_effect=_fake_sse_bytes_stream), \
         patch('app.routers.agent.resolve_lang', new=AsyncMock(return_value='en')):
        response = await stream(
            request=fake_request,
            body=body,
            current_user={'id': '00000000-0000-0000-0000-000000000002'},
            db=MagicMock(),
        )

    assert isinstance(response, StreamingResponse)
    collected = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            collected.append(chunk.decode('utf-8'))
        else:
            collected.append(chunk)
    joined = ''.join(collected)
    # Fresh stream was dispatched (not the replay path).
    assert 'new-id' in joined


@pytest.mark.asyncio
async def test_chat_stream_no_last_event_id_uses_fresh_stream():
    """Sanity: a brand-new request (no Last-Event-ID header) takes the
    fresh-stream path. The reconnect short-circuit must not fire."""
    from fastapi.responses import StreamingResponse

    from app.routers.agent import stream

    async def _fake_sse_bytes_stream(*args, **kwargs):
        yield b'data: {"request_id":"fresh"}\n\n'
        yield b'data: [DONE]\n\n'

    fake_request = MagicMock()
    fake_request.headers = {}  # No Last-Event-ID.

    body = MagicMock()
    body.book_id = '00000000-0000-0000-0000-000000000001'
    body.message = 'hello'
    body.context = {'companionMode': 'casual'}
    body.persona = None
    body.genre = None

    with patch('app.routers.agent.sse_bytes_stream', side_effect=_fake_sse_bytes_stream), \
         patch('app.routers.agent.resolve_lang', new=AsyncMock(return_value='en')):
        response = await stream(
            request=fake_request,
            body=body,
            current_user={'id': '00000000-0000-0000-0000-000000000002'},
            db=MagicMock(),
        )

    assert isinstance(response, StreamingResponse)
