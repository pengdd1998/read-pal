"""Agent service — shared helpers for agent router handlers.

Keeps the router thin by extracting repeated patterns:
- SSE bytes wrapping with error handling
- ValueError → HTTPException translation
- User language resolution
- Keepalive frames to prevent proxy timeouts during long LLM thinking
"""

import asyncio
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import companion_service
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, translate_error, t

KEEPALIVE_INTERVAL = 15  # seconds between keepalive comment frames
_KEEPALIVE_FRAME = b': keepalive\n\n'
_SENTINEL = None  # signals stream end


async def resolve_lang(db: AsyncSession, user_id: UUID) -> str:
    """Get the user's language preference."""
    return await _get_user_lang(db, user_id)


def raise_not_found(exc: ValueError, lang: str = DEFAULT_LANGUAGE) -> None:
    """Convert a service ValueError into an HTTP 404."""
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={'code': 'NOT_FOUND', 'message': translate_error(exc, lang)},
    ) from exc


async def sse_bytes_stream(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator.

    Handles ValueError and unexpected exceptions, yielding SSE-formatted
    error frames so the client always gets a clean stream termination.

    Sends ``: keepalive\\n\\n`` SSE comment frames every 15 seconds while
    waiting for LLM tokens to prevent nginx/proxy connection timeouts during
    long thinking periods.
    """
    import logging

    logger = logging.getLogger('read-pal.agent')
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    async def _llm_producer() -> None:
        """Read LLM chunks and push encoded bytes into the shared queue."""
        try:
            async for chunk in companion_service.stream_chat(
                db, user_id, book_id, message, context=context,
                companion_mode=companion_mode, persona=persona, lang=lang,
            ):
                await queue.put(chunk.encode('utf-8'))
        except ValueError as exc:
            error_msg = f'data: {{"error": "{exc}"}}\n\n'
            await queue.put(error_msg.encode('utf-8'))
        except Exception:
            logger.exception('Streaming error in agent chat')
            internal_msg = t('errors.internal_error')
            error_msg = f'data: {{"error": "{internal_msg}"}}\n\n'
            await queue.put(error_msg.encode('utf-8'))
        finally:
            await queue.put(_SENTINEL)

    async def _keepalive() -> None:
        """Periodically push keepalive frames into the shared queue."""
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            await queue.put(_KEEPALIVE_FRAME)

    producer_task = asyncio.create_task(_llm_producer())
    keepalive_task = asyncio.create_task(_keepalive())

    try:
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item
    finally:
        for task in (producer_task, keepalive_task):
            task.cancel()
        await asyncio.gather(producer_task, keepalive_task, return_exceptions=True)
        logger.debug('SSE stream closed for user=%s book=%s', user_id, book_id)
