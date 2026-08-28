"""Redis-backed idempotency middleware for POST endpoints.

Prevents duplicate processing when clients retry requests (e.g., double-click,
timeout auto-retry). Uses Idempotency-Key header to cache and replay responses
within 24 hours.
"""

import json
import re
import time
from collections.abc import Callable
from typing import Any

import redis.asyncio as aioredis
import redis.exceptions
import structlog
from fastapi import Depends, HTTPException, Request, Response, status

from app.core.redis import get_redis
from app.middleware.auth import get_current_user

# P4.4: switched from stdlib logging to structlog so the existing
# event-style calls (``logger.warning('idempotency.X', error=...)``) actually
# work — stdlib ``Logger.warning`` rejects unknown kwargs like ``error=``,
# which silently broke the catch-all exception paths until P0.1 turned
# enforcement on and started exercising them.
logger = structlog.get_logger('read-pal.idempotency')

IDEMPOTENCY_PREFIX = 'idem:'

# Response data placeholder for "processing" state
_PROCESSING = None

# Regex for UUID or 32-char hex
_KEY_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|[0-9a-f]{32}$', re.IGNORECASE)


# --- In-memory fallback -------------------------------------------------------

_memory_store: dict[str, tuple[Any, float]] = {}


def _evict_expired(now: float) -> None:
    """Remove expired entries to prevent unbounded memory growth."""
    expired = [k for k, (_, reset) in _memory_store.items() if now > reset]
    for k in expired:
        _memory_store.pop(k, None)


# --- IdempotencyStore class ---------------------------------------------------

class IdempotencyStore:
    """Idempotency cache backed by Redis with in-memory fallback."""

    def __init__(self) -> None:
        self.redis: aioredis.Redis = get_redis()

    async def get_cached_response(
        self,
        user_id: str,
        key: str,
    ) -> Any | None:
        """Return cached response if available, None otherwise."""
        redis_key = f'{IDEMPOTENCY_PREFIX}{user_id}:{key}'

        try:
            cached = await self.redis.get(redis_key)
            if cached is None:
                return None

            import json
            return json.loads(cached)

        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('Redis unavailable — using in-memory idempotency fallback')
            return self._memory_get(redis_key, time.time())

        except Exception as exc:
            logger.warning('idempotency.get_failed', error=str(exc)[:200])
            return None

    async def mark_processing(
        self,
        user_id: str,
        key: str,
    ) -> bool:
        """Mark request as processing to prevent duplicate work.

        Returns True if this is the first request (processing started).
        Returns False if already processing (should skip).
        """
        redis_key = f'{IDEMPOTENCY_PREFIX}{user_id}:{key}'

        try:
            # SET NX returns True if key was set (first request)
            result = await self.redis.set(redis_key, json.dumps(_PROCESSING), nx=True, ex=86400)
            return result is not None

        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('Redis unavailable — using in-memory idempotency fallback')
            now = time.time()
            return self._memory_mark_processing(redis_key, now)

        except Exception as exc:
            logger.warning('idempotency.mark_processing_failed', error=str(exc)[:200])
            return True  # Fail open - allow request to proceed

    async def store_response(
        self,
        user_id: str,
        key: str,
        response: dict[str, Any],
    ) -> None:
        """Store the final response for future replay."""
        redis_key = f'{IDEMPOTENCY_PREFIX}{user_id}:{key}'

        try:
            await self.redis.set(redis_key, json.dumps(response), ex=86400)

        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('Redis unavailable — using in-memory idempotency fallback')
            self._memory_store_response(redis_key, response, time.time())

        except Exception as exc:
            logger.warning('idempotency.store_failed', error=str(exc)[:200])

    # -- in-memory fallback ---

    def _memory_get(self, key: str, now: float) -> Any | None:
        entry = _memory_store.get(key)
        if entry is None:
            return None
        response, reset = entry
        if now > reset:
            _memory_store.pop(key, None)
            return None
        return response

    def _memory_mark_processing(self, key: str, now: float) -> bool:
        if key in _memory_store and now <= _memory_store[key][1]:
            return False  # Already processing
        _memory_store[key] = (_PROCESSING, now + 86400)
        return True

    def _memory_store_response(self, key: str, response: Any, now: float) -> None:
        _memory_store[key] = (response, now + 86400)


# --- Lazy singleton -----------------------------------------------------------

_store: IdempotencyStore | None = None


def _get_store() -> IdempotencyStore:
    global _store
    if _store is None:
        _store = IdempotencyStore()
    return _store


# --- Key validation -----------------------------------------------------------

def _validate_key(key: str | None) -> str:
    """Validate and return the idempotency key.

    Raises HTTPException if missing or malformed — but ONLY when enforcement
    is enabled (``settings.idempotency_enforce == True``). When enforcement
    is off (the default), missing/malformed keys are silently accepted and
    the dependency becomes a no-op. This lets the wiring land in dev/test
    without breaking existing clients; production flips the flag after
    frontend ships the ``Idempotency-Key`` header.
    """
    from app.config import get_settings
    enforce = get_settings().idempotency_enforce

    if not key:
        if enforce:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    'code': 'VALIDATION_ERROR',
                    'message': 'Idempotency-Key header is required',
                },
            )
        # Not enforced — return empty string; downstream code skips cache ops
        # when the key is empty (check_idempotency_cache short-circuits on
        # missing request.state.idempotency_* attrs).
        return ''

    if not _KEY_PATTERN.match(key):
        if enforce:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    'code': 'VALIDATION_ERROR',
                    'message': 'Idempotency-Key must be a UUID or 32-character hex string',
                },
            )
        logger.warning(
            'idempotency.malformed_key_ignored', enforce=False, key=key[:50],
        )
        return ''

    return key


# --- FastAPI dependencies ----------------------------------------------------

def _extract_idempotency_key(request: Request) -> str | None:
    """Pull the Idempotency-Key header out of the request.

    P4.4: extracted as a named function instead of an inline ``lambda r: ...``
    dependency. The lambda relied on FastAPI recognizing parameter ``r`` as
    a Request by name (it isn't — FastAPI uses the type annotation), so
    the original lambda silently returned ``None`` for every request and
    enforcement degraded to ``if not key: return ''``. Tests at the
    /agent/chat endpoint surfaced this as 422 once ``idempotency_enforce``
    flipped on. Named function with ``request: Request`` annotation lets
    FastAPI inject correctly.
    """
    return request.headers.get('Idempotency-Key')


def _idempotent_impl(
    request: Request,
    idempotency_key: str | None = Depends(_extract_idempotency_key),
    user: dict = Depends(get_current_user),
) -> None:
    """Dependency that validates and stores idempotency context in request.state.

    Use the exported ``idempotent`` (already wrapped in ``Depends(...)``) in
    route decorators:

    ```python
    @router.post('/endpoint', dependencies=[..., idempotent])
    async def handler(request: Request, db: AsyncSession = Depends(get_db)):
        # Check cache
        cached = await check_idempotency_cache(request)
        if cached is not None:
            return cached

        # ... process request ...

        # Store result
        await store_idempotency_response(request, {'success': True, 'data': result})
        return result
    ```
    """
    validated_key = _validate_key(idempotency_key)
    user_id = user.get('id') or user.get('sub') or ''

    # Store in request.state for later use by utility functions
    request.state.idempotency_key = validated_key
    request.state.idempotency_user_id = user_id
    request.state.idempotency_store = _get_store()


# Wrapped dependency — matches the convention used by ``rate_limiter`` and
# ``daily_llm_budget`` so routers can do ``dependencies=[..., idempotent]``
# without needing to wrap in ``Depends(...)`` at every call site.
idempotent = Depends(_idempotent_impl)


async def check_idempotency_cache(request: Request) -> Any | None:
    """Check for cached response. Returns cached dict or None.

    Call at the start of a route handler protected by the `idempotent` dependency.
    """
    store = getattr(request.state, 'idempotency_store', None)
    user_id = getattr(request.state, 'idempotency_user_id', None)
    key = getattr(request.state, 'idempotency_key', None)

    if not all([store, user_id, key]):
        return None

    # Mark as processing - if already processing, check cache
    is_first = await store.mark_processing(user_id, key)

    if not is_first:
        cached = await store.get_cached_response(user_id, key)
        if cached is not None:
            return cached
        # Still processing - raise for retry
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail={
                'code': 'PROCESSING',
                'message': 'Request is still being processed. Retry with the same Idempotency-Key.',
            },
            headers={'Retry-After': '5'},
        )

    return None


async def store_idempotency_response(request: Request, response: dict[str, Any]) -> None:
    """Store the response for idempotency replay.

    Call at the end of a route handler protected by the `idempotent` dependency.
    """
    store = getattr(request.state, 'idempotency_store', None)
    user_id = getattr(request.state, 'idempotency_user_id', None)
    key = getattr(request.state, 'idempotency_key', None)

    if all([store, user_id, key]):
        await store.store_response(user_id, key, response)


async def _idempotent_stream_impl(
    request: Request,
    idempotency_key: str | None = Depends(_extract_idempotency_key),
    user: dict = Depends(get_current_user),
) -> None:
    """Dependency for streaming endpoints - prevents duplicate processing only.

    Does NOT cache the full stream (impractical). Distinguishes two replay
    cases via a completion marker stored by :func:`mark_stream_completed`:

    - **Completed**: HTTP 409 ``ALREADY_COMPLETED`` — the original stream
      finished; client must use a new Idempotency-Key.
    - **In-progress**: HTTP 409 ``IDEMPOTENCY_PROCESSING`` — the original
      stream is still running; client may retry shortly.

    Replaces the prior ``RATE_LIMIT_EXCEEDED`` response (P0.6) which was
    misleading on the completed case — the client had no way to know the
    stream already finished and could not fetch its result.
    """
    validated_key = _validate_key(idempotency_key)
    user_id = user.get('id') or user.get('sub') or ''
    store = _get_store()

    is_first = await store.mark_processing(user_id, validated_key)

    if not is_first:
        # D3 reconnect: when the client carries a ``Last-Event-ID`` header,
        # the request is a resume attempt for an earlier stream. Don't raise
        # the 409 — let the handler serve buffered replay chunks (or fall
        # through to a fresh stream if the buffer has expired).
        if request.headers.get('last-event-id'):
            return
        cached = await store.get_cached_response(user_id, validated_key)
        if isinstance(cached, dict) and cached.get('_stream_completed'):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'code': 'ALREADY_COMPLETED',
                    'message': 'A stream with this Idempotency-Key already completed. Use a new key.',
                },
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'IDEMPOTENCY_PROCESSING',
                'message': 'An identical request is still processing. Retry shortly.',
            },
            headers={'Retry-After': '5'},
        )


# Wrapped streaming variant. See ``idempotent`` above.
idempotent_stream = Depends(_idempotent_stream_impl)


async def mark_stream_completed(request: Request) -> None:
    """Mark a streaming idempotency key as completed.

    Call from the ``finally`` block of a streaming route handler so a
    subsequent replay with the same ``Idempotency-Key`` returns
    ``ALREADY_COMPLETED`` instead of ``IDEMPOTENCY_PROCESSING``.

    No-op when idempotency enforcement is off (no key on the request) —
    the helper is safe to call unconditionally from any streaming handler.
    """
    await store_idempotency_response(request, {'_stream_completed': True})
