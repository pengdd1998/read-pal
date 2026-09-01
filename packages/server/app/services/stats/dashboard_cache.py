"""Redis caching helpers for dashboard stats."""

import json
import logging
from uuid import UUID

from redis.exceptions import RedisError

from app.config import get_settings
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_CACHE_TTL = None  # lazy-init from settings


def _get_cache_ttl() -> int:
    """Return cache TTL from settings (lazy-loaded)."""
    global _CACHE_TTL
    if _CACHE_TTL is None:
        _CACHE_TTL = get_settings().cache_data_ttl_seconds
    return _CACHE_TTL


def _cache_key(uid: UUID) -> str:
    """Return the Redis cache key for a user's dashboard stats."""
    return f'stats:dashboard:{uid}'


def book_stats_cache_key(uid: UUID | str) -> str:
    """Return the Redis cache key for a user's library-status aggregate.

    Single source of truth — ``book_service.get_book_stats`` reads through
    this key, so invalidation and read can never drift apart.
    """
    return f'stats:books:{uid}'


async def invalidate(uid: UUID) -> None:
    """Delete the cached dashboard stats for a user.

    Prefer :func:`invalidate_user_caches` at write sites — it also drops the
    library-status aggregate, which changes with the same writes.
    """
    try:
        redis = get_redis()
        await redis.delete(_cache_key(uid))
    except RedisError as exc:
        logger.warning('Failed to invalidate dashboard cache for user %s: %s', uid, exc)


async def invalidate_user_caches(uid: UUID | str) -> None:
    """Invalidate every derived-stats cache a mutating write can stale.

    Single entry point for write-path invalidation: books CRUD, reading
    sessions, and annotations all funnel here, so the dashboard payload
    (recentBooks, streak, counts) and the library-status aggregate never
    outlive the write that changed them — book deletion used to keep
    serving the deleted book as "current reading" for a full cache TTL.
    """
    await invalidate(UUID(str(uid)))
    try:
        redis = get_redis()
        await redis.delete(book_stats_cache_key(uid))
    except RedisError as exc:
        logger.warning('Failed to invalidate book-stats cache for user %s: %s', uid, exc)


async def read_cache(uid: UUID) -> dict | None:
    """Return cached dashboard data or None on miss/failure."""
    try:
        redis = get_redis()
        cached = await redis.get(_cache_key(uid))
        if cached is not None:
            return json.loads(cached)
    except RedisError as exc:
        logger.warning('Redis read failed for dashboard cache: %s', exc)
    return None


async def write_cache(uid: UUID, data: dict) -> None:
    """Store dashboard data in Redis cache."""
    try:
        redis = get_redis()
        await redis.set(
            _cache_key(uid), json.dumps(data), ex=_get_cache_ttl(),
        )
    except RedisError as exc:
        logger.warning('Failed to cache dashboard stats for user %s: %s', uid, exc)
