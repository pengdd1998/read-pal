"""Redis cache helpers for knowledge graphs."""

from __future__ import annotations

import hashlib
import json
from uuid import UUID

import structlog
import redis.exceptions

from app.core.redis import get_redis as _get_redis
from app.schemas.knowledge import GraphData

logger = structlog.get_logger('read-pal.knowledge')

# ---------------------------------------------------------------------------
# Redis key layout
# ---------------------------------------------------------------------------
# kg:{user_id}:{book_id}:graph  - serialised GraphData JSON (7-day TTL)
# kg:{user_id}:{book_id}:hash   - content hash hex string (7-day TTL)
# ---------------------------------------------------------------------------

GRAPH_KEY_PREFIX = 'kg:'


def _knowledge_cache_ttl() -> int:
    from app.config import get_settings
    return get_settings().cache_knowledge_ttl_seconds


def _graph_cache_key(user_id: UUID, book_id: UUID) -> str:
    return f'{GRAPH_KEY_PREFIX}{user_id}:{book_id}:graph'


def _hash_cache_key(user_id: UUID, book_id: UUID) -> str:
    return f'{GRAPH_KEY_PREFIX}{user_id}:{book_id}:hash'


def _content_hash(texts: list[str]) -> str:
    """Deterministic SHA-256 hash over the concatenated annotation content."""
    h = hashlib.sha256()
    for text in texts:
        h.update(text.encode())
    return h.hexdigest()


async def _load_cached_graph(
    user_id: UUID,
    book_id: UUID,
    current_hash: str,
) -> GraphData | None:
    """Try to load a cached graph from Redis.

    Returns ``None`` when:
      - Redis is unavailable
      - No cached graph exists
      - The content hash has changed (auto-invalidation)
    """
    cache_key = _graph_cache_key(user_id, book_id)
    hash_key = _hash_cache_key(user_id, book_id)

    try:
        r = _get_redis()
        cached_hash, cached_graph = await r.mget(hash_key, cache_key)

        if cached_graph is None:
            return None

        # Content hash mismatch -- annotations changed, invalidate
        if cached_hash is not None and cached_hash != current_hash:
            logger.info(
                'knowledge.cache_hash_mismatch',
                user_id=str(user_id),
                book_id=str(book_id),
            )
            await r.delete(cache_key, hash_key)
            return None

        return GraphData.model_validate_json(cached_graph)
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning('knowledge.cache_read_failed', exc=str(exc)[:200])
        return None


async def _persist_graph(
    user_id: UUID,
    book_id: UUID,
    graph_data: GraphData,
    content_hash: str,
) -> None:
    """Persist graph data and content hash to Redis with configured TTL."""
    cache_key = _graph_cache_key(user_id, book_id)
    hash_key = _hash_cache_key(user_id, book_id)

    try:
        r = _get_redis()
        pipe = r.pipeline()
        pipe.setex(cache_key, _knowledge_cache_ttl(), graph_data.model_dump_json())
        pipe.setex(hash_key, _knowledge_cache_ttl(), content_hash)
        await pipe.execute()
    except redis.exceptions.RedisError as exc:
        logger.warning('knowledge.cache_write_failed', exc=str(exc)[:200])
