"""Fallback streaming for companion chat — multi-provider retry with circuit breaker."""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion.constants import STREAM_FLUSH_SIZE
from app.services.companion.safety import quick_safety_check
from app.services.companion.stream_cache import sse_chunk
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.utils.i18n import t

logger = structlog.get_logger('read-pal.companion')

_STREAM_TIMEOUT_SECONDS = 120


def resolve_fallback_provider(lang: str) -> Any | None:
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
    try:
        llm_fb = get_llm(provider=provider_name)
    except Exception as init_exc:
        logger.error(
            'companion.stream.fallback_provider_init_failed',
            request_id=request_id, provider=provider_name,
            error=str(init_exc)[:500],
        )
        return
    logger.info(
        'companion.stream.fallback_retry',
        request_id=request_id,
        provider=provider_name,
        fallback_model=model_used,
    )
    fb_chunk_buffer: list[str] = []
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm_fb.astream(messages):
            token = chunk.content
            if token:
                collected_parts.append(token)
                fb_chunk_buffer.append(token)
                if len(fb_chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(fb_chunk_buffer)
                    if quick_safety_check(buffered_text):
                        yield sse_chunk(buffered_text)
                    fb_chunk_buffer = []
    if fb_chunk_buffer:
        buffered_text = ''.join(fb_chunk_buffer)
        if quick_safety_check(buffered_text):
            yield sse_chunk(buffered_text)
    await fallback_state.circuit.record_success()
    logger.info(
        'companion.stream.fallback_completed',
        request_id=request_id,
        provider=provider_name,
        model=model_used,
        fallback=True,
        success=True,
    )


async def stream_fallback(
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
) -> AsyncGenerator[str, None]:
    """Try streaming from the next available provider."""
    next_state = resolve_fallback_provider(lang)
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
