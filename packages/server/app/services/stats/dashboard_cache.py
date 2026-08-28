"""Redis caching helpers for dashboard stats."""

import json
import logging
from uuid import UUID


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


async def invalidate(uid: UUID) -> None:
    """Delete the cached dashboard stats for a user.

    Call this when reading sessions end or annotations are created/updated
    so the next dashboard request returns fresh data.
    """
    try:
        redis = get_redis()
        await redis.delete(_cache_key(uid))
    except redis.exceptions.RedisError as exc:
        logger.warning('Failed to invalidate dashboard cache for user %s: %s', uid, exc)


async def read_cache(uid: UUID) -> dict | None:
    """Return cached dashboard data or None on miss/failure."""
    try:
        redis = get_redis()
        cached = await redis.get(_cache_key(uid))
        if cached is not None:
            return json.loads(cached)
    except redis.exceptions.RedisError as exc:
        logger.warning('Redis read failed for dashboard cache: %s', exc)
    return None


async def write_cache(uid: UUID, data: dict) -> None:
    """Store dashboard data in Redis cache."""
    try:
        redis = get_redis()
        await redis.set(
            _cache_key(uid), json.dumps(data), ex=_get_cache_ttl(),
        )
    except redis.exceptions.RedisError as exc:
        logger.warning('Failed to cache dashboard stats for user %s: %s', uid, exc)
