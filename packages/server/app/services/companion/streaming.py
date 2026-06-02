"""SSE streaming for companion chat — circuit breaker, caching, fallback model."""

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
from app.services.llm import circuit, get_llm
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
    """Stream from a primary LLM model with chunk buffering and logging."""
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
    # Flush remaining buffer
    if chunk_buffer:
        buffered_text = ''.join(chunk_buffer)
        safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
        if safe_text:
            yield f'data: {json.dumps({"content": safe_text})}\n\n'
    await circuit.record_success()
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


async def _stream_fallback(
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    fallback_model: str,
    user_id: UUID,
    book_id: UUID,
    lang: str,
) -> AsyncGenerator[str, None]:
    """Try streaming from the fallback model."""
    try:
        llm_fb = get_llm(model=fallback_model)
        logger.info(
            'companion.stream.fallback_retry',
            request_id=request_id,
            fallback_model=fallback_model,
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
        # Flush remaining fallback buffer
        if fb_chunk_buffer:
            buffered_text = ''.join(fb_chunk_buffer)
            if quick_safety_check(buffered_text):
                yield f'data: {json.dumps({"content": buffered_text})}\n\n'
        await circuit.record_success()
        logger.info(
            'companion.stream.fallback_completed',
            request_id=request_id,
            model=fallback_model,
            fallback=True,
            success=True,
        )
    except Exception as fb_exc:
        logger.error(
            'companion.stream.fallback_failed',
            request_id=request_id,
            error=str(fb_exc)[:500],
        )
        await circuit.record_failure()
        fallback = t('companion.fallback_error', lang)
        yield f'data: {json.dumps({"content": fallback})}\n\n'


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
    """Stream companion chat as SSE chunks with circuit breaker + observability."""
    from app.config import get_settings

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

    # Check cache
    cache_hit = False
    try:
        from app.services.llm import _cache_key, _cache_get
        stream_cache_key = _cache_key(messages, 'companion_stream')
        cached_response = await _cache_get(stream_cache_key)
        if cached_response:
            safe = filter_output(cached_response, context='companion_stream')
            if safe:
                yield f'data: {json.dumps({"content": safe})}\n\n'
                yield 'data: [DONE]\n\n'
                await _save_message(db, user_id, book_id, 'user', message)
                await _save_message(db, user_id, book_id, 'assistant', safe)
                cache_hit = True
                return
    except Exception:
        pass

    collected_parts: list[str] = []
    request_id = uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    settings = get_settings()
    model_used = settings.default_model

    try:
        # Circuit breaker gate
        if not await circuit.allow_request():
            logger.warning(
                'companion.stream.circuit_blocked',
                request_id=request_id,
                user_id=str(user_id),
                book_id=str(book_id),
            )
            fallback = t('companion.fallback_error', lang)
            yield f'data: {json.dumps({"content": fallback})}\n\n'
        else:
            try:
                llm = get_llm()
                async for chunk in _stream_with_llm(
                    llm, messages, collected_parts, request_id,
                    start_time, model_used, user_id, book_id, lang,
                ):
                    yield chunk
            except Exception as exc:
                latency_ms = int((time.monotonic() - start_time) * 1000)
                logger.error(
                    'companion.stream.failed',
                    request_id=request_id, model=model_used,
                    latency_ms=latency_ms, success=False,
                    error=str(exc)[:500],
                )
                await circuit.record_failure()
                persist_stream_log(
                    request_id=request_id, model=model_used, latency_ms=latency_ms,
                    success=False, error_message=str(exc)[:500],
                    user_id=user_id, book_id=book_id,
                )
                async for chunk in _stream_fallback(
                    messages, collected_parts, request_id, start_time,
                    settings.fallback_model, user_id, book_id, lang,
                ):
                    yield chunk

        yield 'data: [DONE]\n\n'
    finally:
        # Skip persistence if cache hit already saved messages
        if cache_hit:
            return

        # Always persist messages, even if client disconnects mid-stream
        assistant_content = ''.join(collected_parts)
        if assistant_content:
            assistant_content = filter_output(assistant_content, context='companion_stream')

        if assistant_content:
            try:
                from app.services.llm import _cache_key, _cache_set
                cache_key = _cache_key(messages, 'companion_stream')
                await _cache_set(cache_key, assistant_content)
            except Exception:
                pass

        await _save_message(db, user_id, book_id, 'user', message)
        if assistant_content:
            await _save_message(db, user_id, book_id, 'assistant', assistant_content)
        else:
            logger.warning(
                'companion.stream.empty_response',
                request_id=request_id,
                book_id=str(book_id),
            )
