"""Fallback streaming for companion chat — multi-provider retry with circuit breaker."""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion._disconnect import maybe_mark_disconnect
from app.services.companion.constants import STREAM_FLUSH_SIZE
from app.services.companion.safety import quick_safety_check
from app.services.companion.stream_cache import sse_chunk
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.utils.i18n import t

logger = structlog.get_logger('read-pal.companion')

_STREAM_TIMEOUT_SECONDS = 120


def resolve_fallback_provider(
    lang: str,
    failed_provider_name: str | None = None,
) -> Any | None:
    """Find the next available fallback provider, or None.

    ``failed_provider_name`` is the provider that just failed; the fallback
    should skip it and use a *different* provider when one is available. Without
    it the registry could re-select the same provider that just failed.
    """
    registry = get_registry()
    next_state: Any | None = None
    if failed_provider_name:
        next_state = registry.next_provider_after(failed_provider_name)
    if next_state is None:
        next_state = registry.get_provider(feature='companion_stream')
    return next_state


async def _stream_from_fallback_llm(
    provider_name: str,
    model_used: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    fallback_state: Any,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from a fallback LLM provider with buffered chunk output.

    D1: ``seq_state`` (when provided) is the shared per-request counter
    from ``_stream_via_provider`` — fallback chunks continue the same id
    sequence so Last-Event-ID reconnect resumes at the right offset even
    if the primary emitted some chunks before failing.
    """
    try:
        llm_fb = get_llm(provider=provider_name)
    except Exception as init_exc:
        logger.error(
            'companion.stream.fallback_provider_init_failed',
            request_id=request_id, provider=provider_name,
            error=str(init_exc)[:500],
        )
        yield sse_chunk('[Fallback provider unavailable. Please try again.]')
        return
    logger.info(
        'companion.stream.fallback_retry',
        request_id=request_id,
        provider=provider_name,
        fallback_model=model_used,
    )
    fb_chunk_buffer: list[str] = []
    chunk_counter = 0
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm_fb.astream(messages):
            chunk_counter += 1
            await maybe_mark_disconnect(
                request, cancelled, request_id, chunk_counter,
                model=model_used, provider=provider_name,
            )
            if cancelled is not None and cancelled.is_set():
                logger.info(
                    'companion.stream.fallback_cancelled_inside_astream',
                    request_id=request_id,
                    provider=provider_name,
                )
                break
            token = chunk.content
            # Tool-call / vision chunks emit content as a list of dicts; coerce
            # to text so ''.join below doesn't raise TypeError mid-stream.
            if isinstance(token, list):
                token = ''.join(
                    part.get('text', '') for part in token if isinstance(part, dict)
                )
            if token:
                collected_parts.append(token)
                fb_chunk_buffer.append(token)
                if len(fb_chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(fb_chunk_buffer)
                    if quick_safety_check(buffered_text):
                        yield await _emit_fallback_with_seq(
                            buffered_text, request_id, seq_state,
                        )
                    fb_chunk_buffer = []
    if fb_chunk_buffer:
        buffered_text = ''.join(fb_chunk_buffer)
        if quick_safety_check(buffered_text):
            yield await _emit_fallback_with_seq(
                buffered_text, request_id, seq_state,
            )
    await fallback_state.circuit.record_success()
    logger.info(
        'companion.stream.fallback_completed',
        request_id=request_id,
        provider=provider_name,
        model=model_used,
        fallback=True,
        success=True,
    )


async def _emit_fallback_with_seq(
    content: str,
    request_id: str,
    seq_state: list[int] | None,
) -> str:
    """Build the next id-tagged SSE chunk and persist to replay buffer.

    D1 + D2 helper — mirrors ``streaming._emit_with_seq`` but lives here
    to avoid a circular import (streaming imports stream_fallback).
    """
    if seq_state is None:
        return sse_chunk(content)
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_chunk(content, request_id=request_id, seq=seq)
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk


async def stream_fallback(
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
    failed_provider_name: str | None = None,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Try streaming from the next available provider."""
    next_state = resolve_fallback_provider(lang, failed_provider_name)
    if next_state is None:
        yield sse_chunk(t('companion.fallback_error', lang))
        return

    provider_name = next_state.config.name
    model_used = next_state.config.default_model

    if not await next_state.circuit.allow_request():
        yield sse_chunk(t('companion.fallback_error', lang))
        return

    try:
        async for chunk in _stream_from_fallback_llm(
            provider_name, model_used, messages,
            collected_parts, request_id, next_state,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk
    except Exception as fb_exc:
        logger.error(
            'companion.stream.fallback_failed',
            request_id=request_id,
            provider=provider_name,
            error=str(fb_exc)[:500],
        )
        await next_state.circuit.record_failure()
        yield sse_chunk(t('companion.fallback_error', lang))
