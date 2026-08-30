"""Vendor token pump + id-tagged SSE emission for companion streaming.

Extracted from streaming.py so the chunk loop (this file), provider
fallback orchestration (stream_provider.py), and post-stream persistence
(stream_persist.py) can evolve independently. ``streaming.py`` keeps only
the request-level orchestration and re-exports these for compatibility.
"""

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion._disconnect import maybe_mark_disconnect
from app.services.companion.constants import STREAM_FLUSH_SIZE
from app.services.companion.safety import persist_stream_log
from app.services.companion.stream_cache import sse_chunk, sse_metadata_event
from app.utils.output_filter import filter_stream_chunk

logger = structlog.get_logger('read-pal.companion')

_STREAM_TIMEOUT_SECONDS = 120


async def _stream_with_llm(
    llm: Any,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    model_used: str,
    user_id: UUID,
    book_id: UUID,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from an LLM model with chunk buffering and logging.

    ``cancelled`` is checked between chunks so the inner ``astream`` loop
    exits promptly when the user clicks Stop — without this, the vendor
    keeps generating tokens until the 120s timeout closes the connection.

    B1: ``request`` (when provided) is polled every Nth chunk for client
    TCP disconnect. Starlette detects disconnect lazily; without this poll,
    a client closing the tab mid-stream leaves the vendor generating tokens
    until the 120s hard timeout fires.

    D1: ``seq_state`` is a single-element list used as a mutable counter.
    Each emitted chunk gets the next sequence number, written as
    ``id: {request_id}:{seq}\\n`` before the data line — that id becomes
    the ``Last-Event-ID`` header on client reconnect (D3 + D4). Each
    emitted chunk is also appended to the Redis replay buffer (D2) so
    reconnect can resume from the right offset.
    """
    chunk_buffer: list[str] = []
    first_token_received = False
    ttft_ms: int | None = None
    chunk_counter = 0
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm.astream(messages):
            chunk_counter += 1
            # B1: client-disconnect probe (throttled). Set on disconnect
            # so the upstream finally block skips persistence + the
            # downstream vendor stream gets GC'd via the cancelled event.
            await maybe_mark_disconnect(
                request, cancelled, request_id, chunk_counter,
                model=model_used,
            )
            # Cooperative cancel: check between chunks. When set, break out
            # of the vendor stream so its underlying httpx connection gets
            # closed when this generator is GC'd.
            if cancelled is not None and cancelled.is_set():
                logger.info(
                    'companion.stream.cancelled_inside_astream',
                    request_id=request_id,
                    model=model_used,
                )
                break
            token = chunk.content
            # Tool-call / vision chunks emit content as a list of dicts; coerce
            # to text so ''.join below (and PII redaction) doesn't raise TypeError.
            if isinstance(token, list):
                token = ''.join(
                    part.get('text', '') for part in token if isinstance(part, dict)
                )
            if token:
                if not first_token_received:
                    first_token_received = True
                    ttft_ms = int((time.monotonic() - start_time) * 1000)
                collected_parts.append(token)
                chunk_buffer.append(token)
                if len(chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(chunk_buffer)
                    safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
                    if safe_text:
                        yield await _emit_with_seq(safe_text, request_id, seq_state)
                    chunk_buffer = []
    if chunk_buffer:
        buffered_text = ''.join(chunk_buffer)
        safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
        if safe_text:
            yield await _emit_with_seq(safe_text, request_id, seq_state)
    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        'companion.stream.completed',
        request_id=request_id,
        model=model_used,
        latency_ms=latency_ms,
        ttft_ms=ttft_ms,
        chunk_count=len(collected_parts),
        success=True,
    )
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=True, user_id=user_id, book_id=book_id,
        ttft_ms=ttft_ms,
    )


async def _emit_with_seq(
    content: str,
    request_id: str,
    seq_state: list[int] | None,
) -> str:
    """Build the next id-tagged SSE chunk and persist to replay buffer.

    D1 + D2 helper. When ``seq_state`` is None (terminal/error frames, or
    the legacy cached-response path), falls back to the un-tagged chunk
    format — backward compat preserved.

    When ``seq_state`` is provided:
    - Increment the counter (mutates ``seq_state[0]``).
    - Build ``sse_chunk(content, request_id, seq)`` — emits ``id:`` line.
    - Persist to Redis replay buffer so D3 reconnect can resume.
    """
    if seq_state is None:
        return sse_chunk(content)
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_chunk(content, request_id=request_id, seq=seq)
    # D2: append to replay buffer. Best-effort — never blocks the stream.
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk


async def _emit_metadata_with_seq(
    *,
    request_id: str,
    model: str,
    fallback_used: bool,
    primary_model: str | None = None,
    primary_provider: str | None = None,
    seq_state: list[int] | None = None,
) -> str:
    """Build the next id-tagged metadata event and persist to replay buffer.

    D1 + D2 + B3 helper — mirrors ``_emit_with_seq`` but for metadata
    events so the B3 fallback notice is also replayable on reconnect.
    """
    if seq_state is None:
        return sse_metadata_event(
            request_id=request_id, model=model, fallback_used=fallback_used,
            primary_model=primary_model, primary_provider=primary_provider,
        )
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_metadata_event(
        request_id=request_id, model=model, fallback_used=fallback_used,
        primary_model=primary_model, primary_provider=primary_provider, seq=seq,
    )
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk
