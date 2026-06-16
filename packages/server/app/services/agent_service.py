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
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import companion_service
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

# P0.3: cross-worker heartbeat. Each worker refreshes
# ``worker_alive:{WORKER_ID}`` in Redis every interval so other workers can
# detect when this worker has crashed. TTL is double the interval so we
# tolerate one missed refresh without falsely declaring the worker dead.
_WORKER_HEARTBEAT_INTERVAL = 5  # seconds between refreshes
_WORKER_HEARTBEAT_TTL = 10  # seconds before the key expires

# Registry of in-flight streams keyed by request_id. The asyncio.Event is
# set when the user requests cancellation (POST /chat/cancel); the stream
# consumer checks ``cancelled.is_set()`` between chunks and tears down.
# Entries MUST be removed in a ``finally`` to avoid unbounded growth.
_INFLIGHT_STREAMS: dict[str, asyncio.Event] = {}

# Unique per-worker ID — generated once at startup. Cross-worker cancel uses
# Redis pub/sub keyed on this so POST /chat/cancel can fan out to whichever
# uvicorn worker owns the in-flight stream (P3.3).
WORKER_ID: str = uuid.uuid4().hex[:12]
_CANCEL_CHANNEL_PREFIX = 'cancel_stream:'
_STREAM_OWNER_PREFIX = 'stream_owner:'
# Pub/sub listener task — created once on first register_stream call.
_cancel_listener_task: asyncio.Task | None = None
# Heartbeat refresh task — created alongside the listener.
_heartbeat_task: asyncio.Task | None = None


def _cancel_channel() -> str:
    """Redis channel name this worker subscribes to for cancel signals."""
    return f'{_CANCEL_CHANNEL_PREFIX}{WORKER_ID}'


def _cancel_channel_for(worker_id: str) -> str:
    """Redis channel name any worker subscribes to for cancel signals.

    P4.4: extracted so the channel-name format lives in one place —
    previously the cross-worker path built ``f'{_CANCEL_CHANNEL_PREFIX}{owner_worker_id}'``
    inline, which would silently drift if the prefix changed.
    """
    return f'{_CANCEL_CHANNEL_PREFIX}{worker_id}'


def _stream_owner_key(request_id: str) -> str:
    """Redis key mapping a request_id to the worker that owns its stream.

    P4.4: extracted from four duplicated ``f'stream_owner:{request_id}'``
    inline constructions. The format is part of the cross-worker cancel
    contract — drift between read and write paths would silently break
    cancel delivery.
    """
    return f'{_STREAM_OWNER_PREFIX}{request_id}'


def _worker_alive_key(worker_id: str = WORKER_ID) -> str:
    """Redis key tracking that a worker is alive (refreshed periodically)."""
    return f'worker_alive:{worker_id}'


async def _refresh_heartbeat() -> None:
    """Set/refresh this worker's heartbeat key in Redis.

    Best-effort: on Redis outage the heartbeat simply expires. Other workers
    will then correctly classify our streams as ``unknown_worker`` — which
    is the right answer since we can't receive cancel signals anyway.
    """
    try:
        from app.core.redis import get_redis
        client = get_redis()
        await client.set(_worker_alive_key(), '1', ex=_WORKER_HEARTBEAT_TTL)
    except Exception as exc:  # noqa: BLE001 — heartbeat is best-effort
        logger.debug(
            'agent_service.heartbeat_failed worker=%s error=%s',
            WORKER_ID, str(exc)[:200],
        )


async def _heartbeat_loop() -> None:
    """Refresh worker heartbeat key every interval until cancelled.

    P0.3: this lets :func:`cancel_stream_cross_worker` distinguish "owner
    crashed" from "owner never had this stream" — without it, cancel on a
    crashed worker silently no-ops and the client waits the full stream
    timeout (120s) before giving up.
    """
    try:
        while True:
            await _refresh_heartbeat()
            await asyncio.sleep(_WORKER_HEARTBEAT_INTERVAL)
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001 — heartbeat must stay up
        logger.exception('agent_service.heartbeat_loop_crashed')
        # Re-spawn after a short delay so a transient error doesn't
        # permanently disable heartbeats for this worker.
        await asyncio.sleep(_WORKER_HEARTBEAT_INTERVAL)
        global _heartbeat_task
        _heartbeat_task = asyncio.create_task(_heartbeat_loop())


async def _start_cancel_listener() -> None:
    """Subscribe to this worker's cancel channel and fan out to local Events.

    Runs forever (until app shutdown). Each incoming message carries a
    request_id payload — we look it up in ``_INFLIGHT_STREAMS`` and set
    the local Event to interrupt the stream.
    """
    from app.core.redis import subscribe
    # Prime the heartbeat before subscribing so the first register_stream
    # finds a living worker even before the first refresh tick.
    await _refresh_heartbeat()
    try:
        async for payload in subscribe(_cancel_channel()):
            if isinstance(payload, dict):
                request_id = payload.get('request_id')
            else:
                request_id = payload
            if not request_id:
                continue
            local_event = _INFLIGHT_STREAMS.get(request_id)
            if local_event is not None:
                local_event.set()
                logger.info(
                    'agent_service.cross_worker_cancel request_id=%s', request_id,
                )
    except asyncio.CancelledError:
        # Shutdown — just exit cleanly.
        raise
    except Exception:  # noqa: BLE001 — listener must stay up
        logger.exception('agent_service.cancel_listener_crashed')


def _ensure_cancel_listener() -> None:
    """Start the cancel listener and heartbeat on first stream registration."""
    global _cancel_listener_task, _heartbeat_task
    if _cancel_listener_task is not None and not _cancel_listener_task.done():
        return
    try:
        _cancel_listener_task = asyncio.create_task(_start_cancel_listener())
        if _heartbeat_task is None or _heartbeat_task.done():
            _heartbeat_task = asyncio.create_task(_heartbeat_loop())
    except RuntimeError:
        # No running loop (e.g. import-time check) — will be created lazily
        # on the first real call inside an event loop.
        pass


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
    # Ensure the cross-worker cancel listener is running.
    _ensure_cancel_listener()
    return event


def release_stream(request_id: str) -> None:
    """Remove an in-flight stream from the registry (idempotent)."""
    _INFLIGHT_STREAMS.pop(request_id, None)


def cancel_stream(request_id: str) -> bool:
    """Mark an in-flight stream as cancelled. Returns True if found locally.

    For cross-worker cancel, see :func:`cancel_stream_cross_worker` (async).
    """
    event = _INFLIGHT_STREAMS.get(request_id)
    if event is None:
        return False
    event.set()
    return True


async def cancel_stream_cross_worker(request_id: str) -> dict:
    """Cancel an in-flight stream, fanning out to other workers via Redis.

    Returns a dict ``{cancelled: bool, reason: str}`` so the caller can
    render an appropriate UI response:

    - ``local`` — cancelled on this worker (fast path).
    - ``cross_worker`` — delivered to the owning worker via Redis pub/sub.
    - ``unknown_worker`` (P0.3) — owner key exists in Redis but the owning
      worker's heartbeat has expired. The worker crashed or recycled; the
      stream is orphaned and will time out on its own. Client should treat
      this as "stream lost" rather than "cancel failed".
    - ``not_found`` — no owner key in Redis; stream completed or never
      existed.
    - ``redis_error`` — Redis lookup failed; client may retry.

    Previously returned a bare bool, which conflated "worker crashed" with
    "stream done" — the client had no signal to render "stream lost" UI and
    would wait the full stream timeout before recovering.
    """
    # Fast path: local cancel
    if cancel_stream(request_id):
        return {'cancelled': True, 'reason': 'local'}

    # Cross-worker: look up owning worker
    try:
        from app.core.redis import get_redis, publish
        client = get_redis()
        owner_worker_id = await client.get(_stream_owner_key(request_id))
        if owner_worker_id is None:
            return {'cancelled': False, 'reason': 'not_found'}

        # P0.3: probe owning worker's heartbeat before publishing. Without
        # this check, a publish to a dead worker returns delivered=0 (no
        # subscribers) — indistinguishable from "stream completed normally".
        alive = await client.exists(_worker_alive_key(owner_worker_id))
        if not alive:
            # Owner crashed — clean up the stale owner key so subsequent
            # cancels of the same request_id short-circuit to not_found
            # instead of repeating the unknown-worker probe.
            await client.delete(_stream_owner_key(request_id))
            logger.warning(
                'agent_service.cancel_orphaned_owner request_id=%s owner=%s',
                request_id, owner_worker_id,
            )
            return {'cancelled': False, 'reason': 'unknown_worker'}

        channel = _cancel_channel_for(owner_worker_id)
        delivered = await publish(channel, {'request_id': request_id})
        if delivered > 0:
            return {'cancelled': True, 'reason': 'cross_worker'}
        # Edge case: worker alive but no active subscriber (e.g. mid-reconnect).
        # Treat as unknown so the client renders "stream lost" rather than
        # silently retrying into the same dead channel.
        return {'cancelled': False, 'reason': 'unknown_worker'}
    except Exception as exc:  # noqa: BLE001 — cancel is best-effort
        logger.warning(
            'agent_service.cross_worker_cancel_failed request_id=%s error=%s',
            request_id, str(exc)[:200],
        )
        return {'cancelled': False, 'reason': 'redis_error'}


async def register_stream_cross_worker(request_id: str) -> None:
    """Register stream ownership in Redis so other workers can find us.

    Called alongside :func:`register_stream` when the stream starts.
    Stores ``stream_owner:{request_id}`` → ``WORKER_ID`` with TTL matching
    the stream timeout (300s).
    """
    try:
        from app.core.redis import get_redis
        client = get_redis()
        await client.set(
            _stream_owner_key(request_id), WORKER_ID, ex=300,
        )
    except Exception as exc:  # noqa: BLE001 — registration is best-effort
        logger.debug(
            'agent_service.stream_owner_register_failed request_id=%s error=%s',
            request_id, str(exc)[:200],
        )


async def release_stream_cross_worker(request_id: str) -> None:
    """Clean up Redis ownership entry when a stream ends."""
    try:
        from app.core.redis import get_redis
        client = get_redis()
        await client.delete(_stream_owner_key(request_id))
    except Exception:  # noqa: BLE001 — cleanup is best-effort
        pass


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

    Registers the stream in ``_INFLIGHT_STREAMS`` so ``POST /chat/cancel``
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
