"""Agent service — shared helpers for agent router handlers.

Keeps the router thin by extracting repeated patterns:
- SSE bytes wrapping with error handling
- ValueError → HTTPException translation
- User language resolution
- Keepalive frames to prevent proxy timeouts during long LLM thinking
- In-flight stream registry for cooperative cancellation
"""

import asyncio
import json
import logging
import uuid
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

# Registry of in-flight streams keyed by request_id. The asyncio.Event is
# set when the user requests cancellation (POST /chat/cancel); the stream
# consumer checks ``cancelled.is_set()`` between chunks and tears down.
# Entries MUST be removed in a ``finally`` to avoid unbounded growth.
_INFLIGHT_STREAMS: dict[str, asyncio.Event] = {}


def new_request_id() -> str:
    """Return a fresh request id for an upcoming stream."""
    return uuid.uuid4().hex[:12]


def register_stream(request_id: str) -> asyncio.Event:
    """Register a new in-flight stream and return its cancellation event.

    Re-using a request id while the prior stream is still active is a bug;
    we replace the entry but log a warning so it's visible.
    """
    if request_id in _INFLIGHT_STREAMS:
        logger.warning('agent_service.request_id_reused request_id=%s', request_id)
    event = asyncio.Event()
    _INFLIGHT_STREAMS[request_id] = event
    return event


def release_stream(request_id: str) -> None:
    """Remove an in-flight stream from the registry (idempotent)."""
    _INFLIGHT_STREAMS.pop(request_id, None)


def cancel_stream(request_id: str) -> bool:
    """Mark an in-flight stream as cancelled. Returns True if found."""
    event = _INFLIGHT_STREAMS.get(request_id)
    if event is None:
        return False
    event.set()
    return True


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
    context: dict,
    companion_mode: str,
    persona: str | None,
    genre: str | None,
    lang: str,
    request_id: str,
    cancelled: asyncio.Event,
) -> asyncio.Task:
    """Create and return a task that reads LLM chunks into *queue*."""
    async def _produce() -> None:
        try:
            async for chunk in companion_service.stream_chat(
                db, user_id, book_id, message, context=context,
                companion_mode=companion_mode, persona=persona,
                genre=genre, lang=lang,
                request_id=request_id, cancelled=cancelled,
            ):
                await queue.put(chunk.encode('utf-8'))
        except ValueError as exc:
            logger.warning(
                'agent.stream_validation_error user=%s book=%s error=%s',
                user_id, book_id, str(exc)[:200],
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
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
    request_id: str | None = None,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator.

    Handles ValueError and unexpected exceptions, yielding SSE-formatted
    error frames so the client always gets a clean stream termination.

    Sends ``: keepalive\\n\\n`` SSE comment frames every 15 seconds while
    waiting for LLM tokens to prevent nginx/proxy connection timeouts during
    long thinking periods.

    Registers the stream in ``_INFLIGHT_STREAMS`` so ``POST /chat/cancel``
    can cooperatively cancel a long-running stream by request_id.
    """
    actual_request_id = request_id or new_request_id()
    cancelled = register_stream(actual_request_id)

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    producer = await _start_llm_producer(
        queue, db, user_id, book_id, message,
        context or {}, companion_mode, persona, genre, lang,
        actual_request_id, cancelled,
    )
    keepalive = await _start_keepalive(queue)
    try:
        async for chunk in _consume_queue(queue, [producer, keepalive], user_id, book_id):
            yield chunk
    finally:
        release_stream(actual_request_id)
