"""Agent service — shared helpers for agent router handlers.

Keeps the router thin by extracting repeated patterns:
- SSE bytes wrapping with error handling
- ValueError → HTTPException translation
- User language resolution
- Keepalive frames to prevent proxy timeouts during long LLM thinking
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import companion_service
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, translate_error, t

logger = logging.getLogger('read-pal.agent')

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


async def _start_llm_producer(
    queue: asyncio.Queue[bytes | None],
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None,
    companion_mode: str,
    persona: str | None,
    genre: str | None,
    lang: str,
) -> asyncio.Task:
    """Create and return a task that reads LLM chunks into *queue*."""
    async def _produce() -> None:
        try:
            async for chunk in companion_service.stream_chat(
                db, user_id, book_id, message, context=context,
                companion_mode=companion_mode, persona=persona,
                genre=genre, lang=lang,
            ):
                await queue.put(chunk.encode('utf-8'))
        except ValueError as exc:
            logger.warning(
                'agent.stream_validation_error user=%s book=%s error=%s',
                user_id, book_id, str(exc)[:200],
            )
            error_msg = str(exc) if 'empty' in str(exc).lower() else t('errors.internal_error')
            error_payload = json.dumps({'error': error_msg})
            await queue.put(f'data: {error_payload}\n\n'.encode('utf-8'))
            await queue.put(b'data: [DONE]\n\n')
        except (ConnectionError, TimeoutError, RuntimeError, ValueError, KeyError) as exc:
            logger.warning(
                'Streaming error in agent chat for user=%s book=%s',
                user_id, book_id, exc_info=True,
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
            await queue.put(f'data: {error_payload}\n\n'.encode('utf-8'))
            await queue.put(b'data: [DONE]\n\n')
        except Exception as exc:
            logger.error(
                'Unexpected streaming error in agent chat for user=%s book=%s',
                user_id, book_id, exc_info=True,
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
            await queue.put(f'data: {error_payload}\n\n'.encode('utf-8'))
            await queue.put(b'data: [DONE]\n\n')
        finally:
            await queue.put(_SENTINEL)

    return asyncio.create_task(_produce())


async def _start_keepalive(queue: asyncio.Queue[bytes | None]) -> asyncio.Task:
    """Create and return a task that periodically pushes keepalive frames."""
    async def _loop() -> None:
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            await queue.put(_KEEPALIVE_FRAME)
    return asyncio.create_task(_loop())


async def _consume_queue(
    queue: asyncio.Queue[bytes | None],
    tasks: list[asyncio.Task],
    user_id: UUID,
    book_id: UUID,
) -> AsyncGenerator[bytes, None]:
    """Yield items from *queue* until sentinel, then cancel background tasks."""
    try:
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.debug('SSE stream closed for user=%s book=%s', user_id, book_id)


async def sse_bytes_stream(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    genre: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator.

    Handles ValueError and unexpected exceptions, yielding SSE-formatted
    error frames so the client always gets a clean stream termination.

    Sends ``: keepalive\\n\\n`` SSE comment frames every 15 seconds while
    waiting for LLM tokens to prevent nginx/proxy connection timeouts during
    long thinking periods.
    """
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    producer = await _start_llm_producer(
        queue, db, user_id, book_id, message,
        context, companion_mode, persona, genre, lang,
    )
    keepalive = await _start_keepalive(queue)
    async for chunk in _consume_queue(queue, [producer, keepalive], user_id, book_id):
        yield chunk
