"""P3.3: Redis-backed section checkpoints for memory_book generation.

Memory book generation runs 10 LLM-driven sections via asyncio.gather.
If the process dies mid-run (OOM, deploy, worker restart) the existing
incremental-regen path doesn't help: it only reuses sections already
written to the MemoryBook DB row. Sections that completed but never
made it to DB are lost, and the next run re-attempts them all — under
GLM rate-limiting this can be 5+ minutes of redundant LLM calls.

This module persists each section to Redis the moment it completes. On
the next run, the pipeline reads the checkpoint FIRST and treats every
present section as "already succeeded" — skipping the LLM call entirely.

Lifecycle:
- ``load_checkpoint(user_id, book_id)`` → dict[section_type, section_data]
- ``save_section(user_id, book_id, section_type, section_data)`` → None
- ``clear_checkpoint(user_id, book_id)`` → None  (called after DB write)

TTL: 1 hour. Long enough to outlast any single LLM call (60s+) and a
restart cycle, short enough that stale checkpoints from a user who
abandoned the book don't linger. A user who comes back after >1h
triggers a fresh full regeneration — which is what they want anyway
(more data may have accrued since).
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import redis.exceptions
import structlog

from app.core.redis import get_redis

logger = structlog.get_logger('read-pal.memory_book')

# P3.3: 1 hour TTL. See module docstring for rationale.
_CHECKPOINT_TTL_SECONDS = 3600

_CHECKPOINT_PREFIX = 'mb:ckpt:'


def _checkpoint_key(user_id: UUID, book_id: UUID) -> str:
    """Build the Redis key holding the JSON-encoded section map.

    Scoped per (user, book) — two users generating mirrors for the same
    book must not see each other's partial sections (privacy + correctness
    since enriched_data differs per user).
    """
    return f'{_CHECKPOINT_PREFIX}{user_id}:{book_id}'


async def load_checkpoint(
    user_id: UUID,
    book_id: UUID,
) -> dict[str, dict[str, Any]]:
    """Load any previously-checkpointed sections.

    Returns ``{section_type: section_data}`` for every section that
    previously completed. Returns ``{}`` if no checkpoint exists, the
    blob failed to parse, or Redis is unavailable — all three are
    treated the same ("nothing to reuse") so the pipeline degrades
    gracefully to a full regeneration.
    """
    try:
        raw = await get_redis().get(_checkpoint_key(user_id, book_id))
    except redis.exceptions.RedisError as exc:
        logger.warning(
            'memory_book.checkpoint_load_failed',
            user_id=str(user_id),
            book_id=str(book_id),
            error=str(exc)[:200],
        )
        return {}
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, TypeError) as exc:
        # Corrupted blob — clear it and proceed empty-handed. Better
        # to re-run than to feed garbage into the pipeline.
        logger.warning(
            'memory_book.checkpoint_parse_failed',
            user_id=str(user_id),
            book_id=str(book_id),
            error=str(exc)[:200],
        )
        await clear_checkpoint(user_id, book_id)
        return {}

    if not isinstance(data, dict):
        return {}

    # Only keep entries that look like section dicts (defensive against
    # arbitrary JSON shapes; the JSONB column accepts anything).
    out: dict[str, dict[str, Any]] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, dict):
            out[key] = value
    return out


async def save_section(
    user_id: UUID,
    book_id: UUID,
    section_type: str,
    section_data: dict[str, Any],
) -> None:
    """Upsert a single section into the Redis checkpoint.

    Read-modify-write pattern: load the current blob, add/replace the
    one section, write it back. Slightly racy under concurrent pipeline
    runs for the same (user_id, book_id) — but the pipeline's own
    ``_upsert_memory_book`` uses SELECT FOR UPDATE to serialize full
    pipeline runs at the DB layer, so two pipeline processes shouldn't
    be checkpointing simultaneously. If they are, last-write-wins on a
    single section is acceptable; the final DB write reconciles.

    Errors sections (``{'error': ...}``) are also checkpointed. They'll
    be retried on the next run via the existing incremental-regen path
    (which skips only sections WITHOUT an ``error`` key). Keeping them
    in the checkpoint means we don't lose the *fact* that we attempted,
    even if the process dies before the DB write.
    """
    key = _checkpoint_key(user_id, book_id)
    try:
        existing = await load_checkpoint(user_id, book_id)
    except redis.exceptions.RedisError:
        # load_checkpoint already logged; treat as empty.
        existing = {}
    existing[section_type] = section_data
    try:
        await get_redis().setex(
            key, _CHECKPOINT_TTL_SECONDS, json.dumps(existing),
        )
    except redis.exceptions.RedisError as exc:
        logger.warning(
            'memory_book.checkpoint_save_failed',
            user_id=str(user_id),
            book_id=str(book_id),
            section_type=section_type,
            error=str(exc)[:200],
        )


async def clear_checkpoint(
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Remove the checkpoint after the final DB write succeeds.

    The DB row is now the source of truth; any future regeneration will
    load sections from the DB via the existing incremental-regen path,
    so the Redis checkpoint is redundant. Leaving it would cause the
    next run to use stale Redis data instead of fresher DB data.
    """
    try:
        await get_redis().delete(_checkpoint_key(user_id, book_id))
    except redis.exceptions.RedisError as exc:
        logger.warning(
            'memory_book.checkpoint_clear_failed',
            user_id=str(user_id),
            book_id=str(book_id),
            error=str(exc)[:200],
        )
