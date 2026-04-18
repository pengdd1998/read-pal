"""Redis-backed sliding-window rate limiter.

Mirrors the Node.js rateLimiter middleware:
  - Uses INCR + EXPIRE pattern for atomic counting
  - Falls back to in-memory when Redis is unavailable
  - Adds X-RateLimit-* response headers
"""

import logging
import time
from collections.abc import Callable

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status

from app.config import get_settings

logger = logging.getLogger('read-pal.rate-limit')

RATE_LIMIT_PREFIX = 'rl:'

# --- In-memory fallback -------------------------------------------------------

_memory_store: dict[str, tuple[int, float]] = {}


def _evict_expired(now: float) -> None:
    """Remove expired entries to prevent unbounded memory growth."""
    expired = [k for k, (_, reset) in _memory_store.items() if now > reset]
    for k in expired:
        _memory_store.pop(k, None)


# --- RateLimiter class --------------------------------------------------------

class RateLimiter:
    """Sliding-window rate limiter backed by Redis with in-memory fallback."""

    def __init__(self, redis_url: str) -> None:
        self.redis: aioredis.Redis = aioredis.from_url(
            redis_url,
            decode_responses=True,
        )

    async def check(
        self,
        key: str,
        limit: int,
        window_seconds: int = 60,
    ) -> tuple[bool, dict[str, str]]:
        """Check whether a request is within rate limits.

        Returns ``(allowed, headers)`` where *headers* contains
        ``X-RateLimit-Limit``, ``X-RateLimit-Remaining``, and
        ``X-RateLimit-Reset``.
        """
        redis_key = f'{RATE_LIMIT_PREFIX}{key}'
        now = time.time()

        try:
            count = await self.redis.incr(redis_key)
            if count == 1:
                await self.redis.expire(redis_key, window_seconds)

            ttl = await self.redis.ttl(redis_key)
            remaining = max(0, limit - count)

            headers = {
                'X-RateLimit-Limit': str(limit),
                'X-RateLimit-Remaining': str(remaining),
                'X-RateLimit-Reset': str(int(now + max(ttl, 0))),
            }

            if count > limit:
                headers['Retry-After'] = str(max(ttl, window_seconds))
                return False, headers

            return True, headers

        except Exception:
            logger.debug('Redis unavailable — using in-memory rate-limit fallback')
            _evict_expired(now)
            return self._memory_check(key, now, limit, window_seconds)

    # -- in-memory fallback ---

    def _memory_check(
        self,
        key: str,
        now: float,
        limit: int,
        window_seconds: int,
    ) -> tuple[bool, dict[str, str]]:
        entry = _memory_store.get(key)

        if entry is None or now > entry[1]:
            _memory_store[key] = (1, now + window_seconds)
            return True, {
                'X-RateLimit-Limit': str(limit),
                'X-RateLimit-Remaining': str(limit - 1),
                'X-RateLimit-Reset': str(int(now + window_seconds)),
            }

        count, reset_time = entry
        count += 1
        _memory_store[key] = (count, reset_time)

        remaining = max(0, limit - count)
        headers = {
            'X-RateLimit-Limit': str(limit),
            'X-RateLimit-Remaining': str(remaining),
            'X-RateLimit-Reset': str(int(reset_time)),
        }

        if count > limit:
            headers['Retry-After'] = str(int(reset_time - now))
            return False, headers

        return True, headers


# --- Lazy singleton -----------------------------------------------------------

_limiter: RateLimiter | None = None


def _get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        settings = get_settings()
        _limiter = RateLimiter(settings.redis_url)
    return _limiter


# --- FastAPI dependency factory -----------------------------------------------

def _make_rate_limit_dependency(
    limit: int,
    window_seconds: int = 60,
    key_builder: Callable[[Request], str] | None = None,
) -> Callable:
    """Return a FastAPI dependency that enforces rate limiting."""

    async def _dependency(request: Request) -> None:
        limiter = _get_limiter()
        key = key_builder(request) if key_builder else (request.client.host if request.client else 'unknown')
        allowed, headers = await limiter.check(key, limit, window_seconds)

        # Attach headers to response via state (picked up by middleware or router)
        if not hasattr(request.state, 'rate_limit_headers'):
            request.state.rate_limit_headers = {}
        request.state.rate_limit_headers.update(headers)

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    'code': 'RATE_LIMIT_EXCEEDED',
                    'message': 'Too many requests. Please try again later.',
                },
                headers=headers,
            )

    return _dependency


# --- Pre-configured limiter dependencies --------------------------------------

def _ip_key(request: Request) -> str:
    return request.client.host if request.client else 'unknown'


login_limiter = Depends(_make_rate_limit_dependency(10, 60, _ip_key))
register_limiter = Depends(_make_rate_limit_dependency(5, 60, _ip_key))
password_reset_limiter = Depends(_make_rate_limit_dependency(5, 60, _ip_key))
refresh_limiter = Depends(_make_rate_limit_dependency(5, 60, _ip_key))
account_limiter = Depends(_make_rate_limit_dependency(3, 60, _ip_key))
