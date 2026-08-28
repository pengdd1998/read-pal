"""Centralized Redis client — single connection pool for all services.

P3.3 adds ``publish`` / ``subscribe`` helpers for cross-worker coordination
(notably companion stream cancellation — POST /chat/cancel must reach the
specific uvicorn worker that owns the in-flight stream).
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as aioredis

from app.config import get_settings

logger = logging.getLogger('read-pal.redis')

_client: aioredis.Redis | None = None
# Dedicated pubsub client (separate connection so subscribe doesn't block the main pool)
_pubsub_client: aioredis.Redis | None = None


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


def get_pubsub_redis() -> aioredis.Redis:
    """Return a dedicated Redis client for pub/sub subscriptions.

    Separate from :func:`get_redis` so long-lived subscriptions don't pin
    connections from the main command pool. Used by P3.3 cross-worker cancel.
    """
    global _pubsub_client
    if _pubsub_client is None:
        settings = get_settings()
        _pubsub_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _pubsub_client


async def publish(channel: str, payload: Any) -> int:
    """Publish a JSON-encoded payload to ``channel``.

    Returns the number of subscribers that received the message (0 if no
    workers are listening — useful for diagnostics). Failures are logged
    and return 0; we never raise because pub/sub is best-effort.
    """
    try:
        client = get_redis()
        encoded = json.dumps(payload) if not isinstance(payload, str) else payload
        return await client.publish(channel, encoded)
    except Exception as exc:  # noqa: BLE001 — best-effort publish
        logger.warning('redis.publish_failed channel=%s error=%s', channel, str(exc)[:200])
        return 0


async def subscribe(channel: str) -> AsyncIterator[dict]:
    """Subscribe to ``channel`` and yield decoded messages.

    Each yielded item is the decoded JSON payload (or raw string if not
    JSON). The subscription lives for the lifetime of the returned async
    iterator — typically wrapped in an ``asyncio.create_task`` that runs
    until app shutdown.
    """
    client = get_pubsub_redis()
    pubsub = client.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message['type'] != 'message':
                continue
            data = message['data']
            if isinstance(data, str):
                try:
                    yield json.loads(data)
                except json.JSONDecodeError:
                    yield data
            else:
                yield data
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:  # noqa: BLE001 — best-effort cleanup
            pass


async def close_redis() -> None:
    """Close the shared Redis connection. Call on app shutdown."""
    global _client, _pubsub_client
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pubsub_client is not None:
        await _pubsub_client.aclose()
        _pubsub_client = None
