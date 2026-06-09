"""Cache helpers for companion streaming — lookup, store, and emit cached responses."""

import json
from collections.abc import AsyncGenerator
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion.context import _save_message
from app.utils.output_filter import filter_output

logger = structlog.get_logger('read-pal.companion')


async def try_stream_cache(messages: list) -> str | None:
    """Check LLM cache for a matching stream response. Returns cached text or None."""
    try:
        from app.services.llm import _cache_key, _cache_get
        cache_key = _cache_key(messages, 'companion_stream')
        return await _cache_get(cache_key)
    except (ValueError, ConnectionError, RuntimeError) as exc:
        logger.warning('companion.streaming.cache_check_failed', error=str(exc)[:200])
        return None


def sse_chunk(content: str) -> str:
    """Format a content string as an SSE data chunk."""
    return f'data: {json.dumps({"content": content})}\n\n'


async def emit_cached_response(
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
    yield sse_chunk(safe)
    yield 'data: [DONE]\n\n'
    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', safe)


async def try_emit_cached(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Try cache lookup and emit cached response. Yields nothing on miss."""
    cached_response = await try_stream_cache(messages)
    if not cached_response:
        return
    async for chunk in emit_cached_response(
        db, user_id, book_id, message, cached_response,
    ):
        yield chunk


async def persist_stream_result(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list,
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
        except (ValueError, ConnectionError, RuntimeError) as exc:
            logger.warning('companion.streaming.cache_write_failed', error=str(exc)[:200])

    if not assistant_content:
        logger.warning(
            'companion.stream.empty_response',
            request_id=request_id,
            book_id=str(book_id),
        )
        return

    await _save_message(db, user_id, book_id, 'user', message)
    await _save_message(db, user_id, book_id, 'assistant', assistant_content)
