"""SSE streaming for companion chat — per-provider circuit breaker, multi-provider fallback."""

import asyncio
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion.constants import STREAM_FLUSH_SIZE
from app.services.companion.context import (
    _build_messages,
    _prepare_context,
)
from app.services.companion.safety import persist_stream_log
from app.services.companion.stream_cache import (
    persist_stream_result,
    sse_chunk,
    try_emit_cached,
)
from app.services.companion.stream_fallback import stream_fallback
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.utils.db import db_error_guard
from app.utils.i18n import DEFAULT_LANGUAGE, t
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
) -> AsyncGenerator[str, None]:
    """Stream from an LLM model with chunk buffering and logging."""
    chunk_buffer: list[str] = []
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm.astream(messages):
            token = chunk.content
            if token:
                collected_parts.append(token)
                chunk_buffer.append(token)
                if len(chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(chunk_buffer)
                    safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
                    if safe_text:
                        yield sse_chunk(safe_text)
                    chunk_buffer = []
    if chunk_buffer:
        buffered_text = ''.join(chunk_buffer)
        safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
        if safe_text:
            yield sse_chunk(safe_text)
    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        'companion.stream.completed',
        request_id=request_id,
        model=model_used,
        latency_ms=latency_ms,
        chunk_count=len(collected_parts),
        success=True,
    )
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=True, user_id=user_id, book_id=book_id,
    )


def _get_stream_provider(
    registry: Any,
    request_id: str,
) -> tuple[Any, str, str] | None:
    """Resolve a streaming provider. Returns (state, provider_name, model_used) or None."""
    state = registry.get_provider(feature='companion_stream')
    if state is None:
        logger.warning('companion.stream.no_provider', request_id=request_id)
        return None
    return state, state.config.name, state.config.default_model


async def _handle_stream_failure(
    exc: Exception,
    state: Any,
    provider_name: str,
    model_used: str,
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Log and record a primary provider streaming failure."""
    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.error(
        'companion.stream.failed',
        request_id=request_id, provider=provider_name,
        model=model_used, latency_ms=latency_ms, success=False,
        error=str(exc)[:500],
    )
    await state.circuit.record_failure()
    registry = get_registry()
    registry.record_latency(provider_name, latency_ms, False)
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=False, error_message=str(exc)[:500],
        user_id=user_id, book_id=book_id,
    )


async def _stream_from_provider(
    state: Any,
    provider_name: str,
    model_used: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
) -> AsyncGenerator[str, None]:
    """Stream from primary provider with circuit breaker fallback on failure."""
    if not await state.circuit.allow_request():
        logger.warning(
            'companion.stream.circuit_blocked',
            request_id=request_id,
            provider=provider_name,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang,
        ):
            yield chunk
        return

    try:
        llm = get_llm(provider=provider_name)
        async for chunk in _stream_with_llm(
            llm, messages, collected_parts, request_id,
            start_time, model_used, user_id, book_id,
        ):
            yield chunk
    except Exception as exc:
        await _handle_stream_failure(
            exc, state, provider_name, model_used,
            request_id, start_time, user_id, book_id,
        )
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang,
        ):
            yield chunk


async def _stream_via_provider(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[Any],
    lang: str,
) -> AsyncGenerator[str, None]:
    """Resolve provider, stream response, and persist result."""
    collected_parts: list[str] = []
    request_id = uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    registry = get_registry()

    provider_info = _get_stream_provider(registry, request_id)
    if provider_info is None:
        yield sse_chunk(t('companion.fallback_error', lang))
        yield 'data: [DONE]\n\n'
        return

    state, provider_name, model_used = provider_info

    try:
        async for chunk in _stream_from_provider(
            state, provider_name, model_used, messages,
            collected_parts, request_id, start_time,
            user_id, book_id, lang,
        ):
            yield chunk
        yield 'data: [DONE]\n\n'
    finally:
        try:
            async with db_error_guard(
                'companion.stream.persist_result',
                request_id=request_id,
                user_id=str(user_id),
                book_id=str(book_id),
            ):
                await persist_stream_result(
                    db, user_id, book_id, message, messages,
                    collected_parts, request_id,
                )
        except Exception:
            logger.debug('stream cleanup failed', exc_info=True)


async def stream_chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    genre: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks with per-provider circuit breaker."""
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode,
        persona=persona, genre=genre, lang=lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    if budget.truncations:
        logger.warning(
            'companion.stream.budget_truncated',
            truncations=', '.join(budget.truncations),
            user_id=str(user_id),
            book_id=str(book_id),
        )

    # Try cached response first
    cache_used = False
    async for chunk in try_emit_cached(
        db, user_id, book_id, message, messages,
    ):
        cache_used = True
        yield chunk
    if cache_used:
        return

    # Stream from provider
    async for chunk in _stream_via_provider(
        db, user_id, book_id, message, messages, lang,
    ):
        yield chunk
