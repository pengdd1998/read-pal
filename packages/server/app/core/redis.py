"""Centralized Redis client — single connection pool for all services."""

from __future__ import annotations

import redis.asyncio as aioredis

from app.config import get_settings

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Return the shared async Redis client (lazy-initialized singleton).

    All services, middleware, and routers should use this instead of
    creating their own ``aioredis.from_url()`` connections.

    ``aioredis.from_url()`` is synchronous (it only creates the client,
    does not connect), so this function is safe to call from sync or
    async code.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the shared Redis connection. Call on app shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
