"""Shared Redis cache helpers — eliminates duplicated cache read/write boilerplate."""

from __future__ import annotations

import json
import logging
from typing import Any, TypeVar
from collections.abc import Callable, Coroutine

from redis.exceptions import RedisError

from app.config import get_settings
from app.core.redis import get_redis

logger = logging.getLogger('read-pal.cache')
T = TypeVar('T')


async def cache_get(key: str) -> Any | None:
    """Read from Redis cache. Returns parsed JSON or None on miss/error."""
    try:
        r = get_redis()
        cached = await r.get(key)
        if cached:
            return json.loads(cached)
    except (RedisError, json.JSONDecodeError) as exc:
        logger.warning('cache_read_miss key=%s: %s', key, str(exc)[:150])
    return None


async def cache_set(key: str, data: Any, ttl: int | None = None) -> None:
    """Write to Redis cache. Silently ignores errors."""
    try:
        r = get_redis()
        effective_ttl = ttl or get_settings().cache_data_ttl_seconds
        await r.setex(key, effective_ttl, json.dumps(data, default=str))
    except (RedisError, TypeError) as exc:
        logger.warning('cache_write_failed key=%s: %s', key, str(exc)[:150])


async def cache_delete(key: str) -> None:
    """Drop a cache entry. Silently ignores errors (invalidation is best-effort)."""
    try:
        await get_redis().delete(key)
    except RedisError as exc:
        logger.warning('cache_delete_failed key=%s: %s', key, str(exc)[:150])


async def cache_get_or_compute(  # noqa: UP047 — TypeVar pattern kept for py3.9-style callers; PEP 695 migration tracked
    key: str,
    factory: Callable[[], Coroutine[Any, Any, T]],
    ttl: int | None = None,
) -> T:
    """Read from cache; on miss, compute via *factory*, cache the result, return it."""
    cached = await cache_get(key)
    if cached is not None:
        return cached
    result = await factory()
    await cache_set(key, result, ttl)
    return result
