"""SSE streaming for companion chat — per-provider circuit breaker, multi-provider fallback."""

import json
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
    _save_message,
)
from app.services.companion.safety import persist_stream_log, quick_safety_check
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.utils.i18n import t
from app.utils.output_filter import filter_output, filter_stream_chunk

logger = structlog.get_logger('read-pal.companion')


async def _stream_with_llm(
    llm: Any,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    model_used: str,
    user_id: UUID,
    book_id: UUID,
    lang: str,
) -> AsyncGenerator[str, None]:
    """Stream from an LLM model with chunk buffering and logging."""
    chunk_buffer: list[str] = []
    async for chunk in llm.astream(messages):
        token = chunk.content
        if token:
            collected_parts.append(token)
            chunk_buffer.append(token)
            if len(chunk_buffer) >= STREAM_FLUSH_SIZE:
                buffered_text = ''.join(chunk_buffer)
                safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
                if safe_text:
                    yield f'data: {json.dumps({"content": safe_text})}\n\n'
                chunk_buffer = []
    if chunk_buffer:
        buffered_text = ''.join(chunk_buffer)
        safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
        if safe_text:
            yield f'data: {json.dumps({"content": safe_text})}\n\n'
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


def _resolve_fallback_provider(lang: str) -> Any | None:
    """Find the next available fallback provider, or None."""
    registry = get_registry()
    next_state = registry.next_provider_after('primary')
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
) -> AsyncGenerator[str, None]:
    """Stream from a fallback LLM provider with buffered chunk output."""
    llm_fb = get_llm(provider=provider_name)
    logger.info(
        'companion.stream.fallback_retry',
        request_id=request_id,
        provider=provider_name,
        fallback_model=model_used,
    )
    fb_chunk_buffer: list[str] = []
    async for chunk in llm_fb.astream(messages):
        token = chunk.content
        if token:
            collected_parts.append(token)
            fb_chunk_buffer.append(token)
            if len(fb_chunk_buffer) >= STREAM_FLUSH_SIZE:
                buffered_text = ''.join(fb_chunk_buffer)
                if quick_safety_check(buffered_text):
                    yield f'data: {json.dumps({"content": buffered_text})}\n\n'
                fb_chunk_buffer = []
    if fb_chunk_buffer:
        buffered_text = ''.join(fb_chunk_buffer)
        if quick_safety_check(buffered_text):
            yield f'data: {json.dumps({"content": buffered_text})}\n\n'
    await fallback_state.circuit.record_success()
    logger.info(
        'companion.stream.fallback_completed',
        request_id=request_id,
        provider=provider_name,
        model=model_used,
        fallback=True,
        success=True,
    )


async def _stream_fallback(
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
) -> AsyncGenerator[str, None]:
    """Try streaming from the next available provider."""
    next_state = _resolve_fallback_provider(lang)
    if next_state is None:
        fallback = t('companion.fallback_error', lang)
        yield f'data: {json.dumps({"content": fallback})}\n\n'
        return

    provider_name = next_state.config.name
    model_used = next_state.config.default_model

    if not await next_state.circuit.allow_request():
        fallback = t('companion.fallback_error', lang)
        yield f'data: {json.dumps({"content": fallback})}\n\n'
        return

    try:
        async for chunk in _stream_from_fallback_llm(
            provider_name, model_used, messages,
            collected_parts, request_id, next_state,
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
        fallback = t('companion.fallback_error', lang)
        yield f'data: {json.dumps({"content": fallback})}\n\n'


async def _try_stream_cache(
    messages: list[Any],
) -> str | None:
    """Check LLM cache for a matching stream response. Returns cached text or None."""
    try:
        from app.services.llm import _cache_key, _cache_get
        cache_key = _cache_key(messages, 'companion_stream')
        return await _cache_get(cache_key)
    except Exception as exc:
        logger.debug('companion.streaming.cache_check_failed', error=str(exc)[:200])
        return None


def _get_stream_provider(
    registry: Any,
    request_id: str,
    lang: str,
) -> tuple[Any, str, str] | None:
    """Resolve a streaming provider. Returns (state, provider_name, model_used) or None."""
    state = registry.get_provider(feature='companion_stream')
    if state is None:
        logger.warning('companion.stream.no_provider', request_id=request_id)
        return None
    return state, state.config.name, state.config.default_model


async def _persist_stream_result(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
) -> None:
    """Filter, cache, and persist the streaming result to the database."""
    assistant_content = ''.join(collected_parts)
    if assistant_content:
        assistant_content = filter_output(assistant_content, context='companion_stream')

    if assistant_content:
        try:
            from app.services.llm import _cache_key, _cache_set
            cache_key = _cache_key(messages, 'companion_stream')
            await _cache_set(cache_key, assistant_content)
        except Exception as exc:
            logger.debug('companion.streaming.cache_write_failed', error=str(exc)[:200])

    await _save_message(db, user_id, book_id, 'user', message)
    if assistant_content:
        await _save_message(db, user_id, book_id, 'assistant', assistant_content)
    else:
        logger.warning(
            'companion.stream.empty_response',
            request_id=request_id,
            book_id=str(book_id),
        )


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
        async for chunk in _stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang,
        ):
            yield chunk
        return

    try:
        llm = get_llm(provider=provider_name)
        async for chunk in _stream_with_llm(
            llm, messages, collected_parts, request_id,
            start_time, model_used, user_id, book_id, lang,
        ):
            yield chunk
    except Exception as exc:
        await _handle_stream_failure(
            exc, state, provider_name, model_used,
            request_id, start_time, user_id, book_id,
        )
        async for chunk in _stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang,
        ):
            yield chunk


def _sse_chunk(content: str) -> str:
    """Format a content string as an SSE data chunk."""
    return f'data: {json.dumps({"content": content})}\n\n'


async def _emit_cached_response(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    cached_response: str,
) -> AsyncGenerator[str, None]:
    """Yield cached response as SSE and persist user+assistant messages.

    Yields nothing (empty generator) if cache content fails safety filter.
    """
    safe = filter_output(cached_response, context='companion_stream')
    if not safe:
        return
    yield _sse_chunk(safe)
    yield 'data: [DONE]\n\n'
    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', safe)


async def stream_chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    lang: str = 'en',
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks with per-provider circuit breaker."""
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode,
        persona=persona, lang=lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    if budget.truncations:
        logger.warning(
            'companion.stream.budget_truncated',
            truncations=', '.join(budget.truncations),
            user_id=str(user_id),
            book_id=str(book_id),
        )

    cached_response = await _try_stream_cache(messages)
    if cached_response:
        cache_used = False
        async for chunk in _emit_cached_response(
            db, user_id, book_id, message, cached_response,
        ):
            cache_used = True
            yield chunk
        if cache_used:
            return

    collected_parts: list[str] = []
    request_id = uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    registry = get_registry()

    provider_info = _get_stream_provider(registry, request_id, lang)
    if provider_info is None:
        yield _sse_chunk(t('companion.fallback_error', lang))
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
        await _persist_stream_result(
            db, user_id, book_id, message, messages,
            collected_parts, request_id,
        )
