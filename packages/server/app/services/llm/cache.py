"""LLM response cache — Redis-backed with in-memory fallback."""

from __future__ import annotations

import hashlib
import logging
import time

import redis.exceptions

logger = logging.getLogger('read-pal.llm.cache')

from langchain_core.messages import BaseMessage

from app.config import get_settings

_CACHE_PREFIX = 'llm:cache:'

_in_memory_cache: dict[str, tuple[float, str]] = {}


def _cache_ttl() -> int:
    """Cache TTL in seconds from configuration."""
    return get_settings().cache_llm_ttl_seconds


def _max_in_memory() -> int:
    """Max in-memory cache entries from configuration."""
    return get_settings().cache_llm_max_entries


def _cache_key(
    messages: list[BaseMessage],
    label: str,
    model: str | None = None,
    user_id: str | None = None,
    lang: str | None = None,
    prompt_version: str | None = None,
) -> str:
    """Deterministic cache key from messages + label + model + user_id + lang + prompt_version.

    - ``user_id`` prevents cross-user cache collisions: without it, two users
      with identical prompts would share a cached LLM response — a privacy leak.
    - ``lang`` prevents cross-language leaks: the system prompt is built per-lang
      OUTSIDE the cached call site, so without lang in the key, a user who
      flips language gets the prior language's cached response.
    - ``prompt_version`` (P0.4) invalidates the cache when a prompt template's
      declared version bumps. Without it, a hotfix to fix hallucination lands
      silently inert for any user who hit that key in the last TTL window.
      When None, the key still includes the slot so future versioned prompts
      can't collide with pre-version entries.
    """
    model_name = model or get_settings().default_model
    parts = [
        label, model_name,
        f'user:{user_id or "anon"}',
        f'lang:{lang or "default"}',
        f'pv:{prompt_version or "none"}',
    ]
    for msg in messages:
        parts.append(msg.content)
    # Length-prefixed join so a message containing '|' can't collide with
    # another user's different message structure.
    digest = hashlib.sha256(
        ''.join(f'{len(p)}:{p}' for p in parts).encode(),
    ).hexdigest()[:16]
    return f'{_CACHE_PREFIX}{digest}'


async def _cache_get(key: str) -> str | None:
    """Get cached LLM response from Redis (fallback: in-memory)."""
    ttl = _cache_ttl()
    if key in _in_memory_cache:
        ts, val = _in_memory_cache[key]
        if time.monotonic() - ts < ttl:
            return val
        del _in_memory_cache[key]

    try:
        from app.core.redis import get_redis as _get_redis
        r = _get_redis()
        return await r.get(key)
    except redis.exceptions.RedisError as exc:
        logger.warning('llm.cache_read_failed: %s', str(exc)[:200])
        return None


async def _cache_set(key: str, value: str) -> None:
    """Store LLM response in Redis (fallback: in-memory)."""
    ttl = _cache_ttl()
    _in_memory_cache[key] = (time.monotonic(), value)
    max_entries = _max_in_memory()
    if len(_in_memory_cache) > max_entries:
        oldest = sorted(_in_memory_cache.items(), key=lambda x: x[1][0])
        for k, _ in oldest[:len(_in_memory_cache) // 2]:
            del _in_memory_cache[k]

    try:
        from app.core.redis import get_redis as _get_redis
        r = _get_redis()
        await r.setex(key, ttl, value)
    except redis.exceptions.RedisError as exc:
        logger.warning('llm.cache_write_failed: %s', str(exc)[:200])
