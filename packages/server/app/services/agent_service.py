"""Agent service — SSE plumbing and router-facing helpers.

Keeps the router thin by extracting repeated patterns:
- SSE bytes wrapping with error handling
- ValueError → HTTPException translation
- User language resolution
- Keepalive frames to prevent proxy timeouts during long LLM thinking

The in-flight stream registry and cross-worker cancellation subsystem
(P0.3 / P3.3) live in ``app.services.agent.stream_registry`` and are
re-exported below for historical import paths.
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import companion_service
from app.services.agent.stream_registry import (  # noqa: F401 — re-exported API
    WORKER_ID,
    cancel_stream,
    cancel_stream_cross_worker,
    new_request_id,
    register_stream,
    register_stream_cross_worker,
    release_stream,
    release_stream_cross_worker,
)
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, translate_error, t

logger = logging.getLogger('read-pal.agent')

KEEPALIVE_INTERVAL = 15  # seconds between keepalive comment frames
_KEEPALIVE_FRAME = b': keepalive\n\n'
# P1.4: emit a one-shot warning when the SSE consumer sees only keepalives
# for this long — the producer is stalled (vendor hung mid-stream, network
# blackhole) but the 120s hard timeout hasn't fired yet. The warning gives
# ops visibility into partial-outage cases where users see "spinner with
# no progress" for a minute then a fallback. Tuned to 4× keepalive interval
# so we tolerate 3 dropped chunks before flagging.
_PRODUCER_STALL_WARN_SECONDS = 60
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
    context: dict,
    companion_mode: str,
    persona: str | None,
    genre: str | None,
    lang: str,
    request_id: str,
    cancelled: asyncio.Event,
    request: Any = None,
) -> asyncio.Task:
    """Create and return a task that reads LLM chunks into *queue*."""
    async def _produce() -> None:
        try:
            async for chunk in companion_service.stream_chat(
                db, user_id, book_id, message, context=context,
                companion_mode=companion_mode, persona=persona,
                genre=genre, lang=lang,
                request_id=request_id, cancelled=cancelled, request=request,
            ):
                await queue.put(chunk.encode('utf-8'))
        except ValueError as exc:
            logger.warning(
                'agent.stream_validation_error user=%s book=%s error=%s',
                user_id, book_id, str(exc)[:200],
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
            await queue.put(f'data: {error_payload}\n\n'.encode())
            await queue.put(b'data: [DONE]\n\n')
        except (ConnectionError, TimeoutError, RuntimeError, ValueError, KeyError):
            logger.warning(
                'Streaming error in agent chat for user=%s book=%s',
                user_id, book_id, exc_info=True,
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
            await queue.put(f'data: {error_payload}\n\n'.encode())
            await queue.put(b'data: [DONE]\n\n')
        except Exception:
            logger.error(
                'Unexpected streaming error in agent chat for user=%s book=%s',
                user_id, book_id, exc_info=True,
            )
            error_payload = json.dumps({'error': t('errors.internal_error')})
            await queue.put(f'data: {error_payload}\n\n'.encode())
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
    """Yield items from *queue* until sentinel, then cancel background tasks.

    P1.4: tracks time since last real (non-keepalive) chunk. If only
    keepalives have landed for ``_PRODUCER_STALL_WARN_SECONDS``, emits a
    one-shot ``agent_stream_producer_stalled`` warning so ops can see
    vendor-side hangs before the 120s hard timeout fires.
    """
    last_real_chunk_at = time.monotonic()
    stall_warned = False
    try:
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            if item is _KEEPALIVE_FRAME:
                if not stall_warned:
                    stall_seconds = time.monotonic() - last_real_chunk_at
                    if stall_seconds >= _PRODUCER_STALL_WARN_SECONDS:
                        logger.warning(
                            'agent_stream_producer_stalled user=%s book=%s '
                            'stall_seconds=%.1f',
                            user_id, book_id, stall_seconds,
                        )
                        stall_warned = True
            else:
                last_real_chunk_at = time.monotonic()
                stall_warned = False
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
    request: Any = None,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator.

    Handles ValueError and unexpected exceptions, yielding SSE-formatted
    error frames so the client always gets a clean stream termination.

    Sends ``: keepalive\\n\\n`` SSE comment frames every 15 seconds while
    waiting for LLM tokens to prevent nginx/proxy connection timeouts during
    long thinking periods.

    Registers the stream in the in-flight registry so ``POST /chat/cancel``
    can cooperatively cancel a long-running stream by request_id.

    When *request* is provided (a FastAPI ``Request`` with idempotency
    state attached), the stream is marked completed on termination so a
    replay with the same ``Idempotency-Key`` returns ``ALREADY_COMPLETED``
    instead of the misleading ``RATE_LIMIT_EXCEEDED`` (P0.6).
    """
    actual_request_id = request_id or new_request_id()
    cancelled = register_stream(actual_request_id)
    # Cross-worker: register ownership in Redis so POST /chat/cancel on any
    # other worker can find us via pub/sub. Best-effort; local cancel still
    # works if Redis is down.
    await register_stream_cross_worker(actual_request_id)

    # C1: global concurrency bulkhead. The Redis-backed counter spans all
    # workers on the host — preventing vendor connection pool exhaustion
    # under a viral traffic spike that distributes across uvicorn workers.
    # Fails-open if Redis is down (returns True), so a flaky Redis never
    # 503s the stream.
    from app.services.llm.concurrency import acquire_stream_slot, release_stream_slot
    if not await acquire_stream_slot(actual_request_id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                'code': 'STREAM_CAPACITY',
                'message': 'Too many concurrent streams. Please retry shortly.',
            },
            headers={'Retry-After': '5'},
        )

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    producer = await _start_llm_producer(
        queue, db, user_id, book_id, message,
        context or {}, companion_mode, persona, genre, lang,
        actual_request_id, cancelled, request,
    )
    keepalive = await _start_keepalive(queue)
    try:
        async for chunk in _consume_queue(queue, [producer, keepalive], user_id, book_id):
            yield chunk
    finally:
        release_stream(actual_request_id)
        await release_stream_cross_worker(actual_request_id)
        await release_stream_slot()
        if request is not None:
            try:
                from app.middleware.idempotency import mark_stream_completed
                await mark_stream_completed(request)
            except Exception:  # noqa: BLE001 — completion marker is best-effort
                logger.debug(
                    'agent_service.stream_completion_mark_failed request_id=%s',
                    actual_request_id,
                )
