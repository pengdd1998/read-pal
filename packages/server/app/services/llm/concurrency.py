"""Global streaming concurrency control via Redis-backed bulkhead.

C1: previously an in-process ``asyncio.Semaphore`` — bound per-worker only.
With N uvicorn workers the true ceiling was N × cap, so a viral traffic spike
could still exhaust the vendor connection pool. This rewrite uses a Redis
INCR/DECR counter so the cap spans every worker on the host.

Failure modes (all best-effort, never blocks traffic):
- Redis down on acquire → fail-open (allow request). Better to risk a brief
  over-subscription than to 503 every stream because the coordination layer
  is flaky.
- Redis down on release → INCR survives, but TTL on the key auto-releases
  orphaned slots after ``SLOT_TTL`` seconds (worker crash safety net).
- Acquire succeeded but caller never released → TTL sweeps the slot.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger('read-pal.llm')


# Global key — every worker increments / decrements the same counter.
_STREAM_SLOT_KEY = 'llm:stream_slots'
# TTL safety net: if a worker crashes mid-stream and never decrements, the
# key auto-expires so the slot isn't permanently "leaked". 5 min is generous
# for the 120s streaming timeout — long enough that a slow stream never
# auto-expires mid-flight, short enough that an orphaned slot reopens in
# bounded time.
_SLOT_TTL_SECONDS = 300


def _get_cap() -> int:
    """Read the configured stream cap from settings.

    Best-effort: returns 20 if settings can't be loaded (e.g. during early
    import or test fixture setup).
    """
    try:
        from app.config import get_settings
        return getattr(get_settings(), 'llm_max_concurrent_streams', 20)
    except Exception:  # noqa: BLE001 — best-effort cap on import error
        return 20


async def acquire_stream_slot(request_id: str) -> bool:
    """Atomically acquire a global streaming slot.

    Returns True on success, False when the global cap is reached. Fails
    open (returns True) when Redis is unavailable — we'd rather briefly
    over-subscribe than 503 every stream on Redis flakiness.

    Algorithm: INCR the counter. If the new value is 1, set TTL (so the
    safety-net expiry is established on first acquire and refreshed by
    subsequent acquires that re-set the value back to 1). If the new value
    exceeds the cap, DECR back and return False.
    """
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        current = await redis.incr(_STREAM_SLOT_KEY)
        if current == 1:
            # First acquire in (what Redis sees as) a fresh window — establish
            # the TTL safety net. Subsequent acquires don't refresh the TTL,
            # so the counter eventually returns to 0 and the key disappears
            # even if the last release fails.
            await redis.expire(_STREAM_SLOT_KEY, _SLOT_TTL_SECONDS)
        if current > _get_cap():
            await redis.decr(_STREAM_SLOT_KEY)
            logger.warning(
                'llm.stream.semaphore_exhausted',
                request_id=request_id,
                cap=_get_cap(),
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — Redis-down fail-open
        logger.warning(
            'llm.stream.semaphore_acquire_failed_failopen',
            request_id=request_id,
            error=str(exc)[:200],
        )
        return True


async def release_stream_slot() -> None:
    """Release a streaming slot.

    Never raises. Redis-down is logged at debug level — by the time release
    runs, the stream already completed successfully and the orphaned slot
    will be swept by the TTL safety net.
    """
    try:
        from app.core.redis import get_redis
        redis = get_redis()
        # DECR is bounded by Redis itself (won't go below zero in well-behaved
        # usage; an over-decrement from a duplicate release would negative-
        # count, which we guard against by clamping).
        current = await redis.decr(_STREAM_SLOT_KEY)
        if current < 0:
            # Defensive: duplicate release or crashed-state recovery. Reset
            # to 0 so subsequent acquires work correctly.
            await redis.set(_STREAM_SLOT_KEY, 0)
            logger.warning(
                'llm.stream.semaphore_release_overdecrement',
                current=current,
            )
    except Exception as exc:  # noqa: BLE001 — release best-effort
        logger.debug(
            'llm.stream.semaphore_release_failed',
            error=str(exc)[:200],
        )
