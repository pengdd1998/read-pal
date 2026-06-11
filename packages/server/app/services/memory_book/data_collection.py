"""Data collection for Reading Mirror — orchestration layer.

Per-source fetchers live in collectors.py.
Enrichment steps live in enrichment_steps.py.
"""

from __future__ import annotations

import asyncio

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.memory_book.collectors import (
    _build_stats,
    _fetch_annotations,
    _fetch_book_meta,
    _fetch_conversations,
    _fetch_flashcards,
    _fetch_reading_sessions,
)
from app.services.memory_book.enrichment_steps import (
    _merge_enrichment_results,
    _run_enrichment_steps,
)

logger = structlog.get_logger('read-pal.memory_book')


# ---------------------------------------------------------------------------
# Gather result helpers
# ---------------------------------------------------------------------------


def _unpack_gather_results(
    results: list[Any],
    book_id: UUID,
) -> dict[str, Any]:
    """Unpack parallel gather results with graceful degradation."""
    ann_result = results[0]
    if isinstance(ann_result, Exception):
        logger.warning('Annotations fetch failed for book %s', book_id, exc_info=ann_result)
        highlights, notes = [], []
    else:
        highlights, notes = ann_result

    conv_result = results[1]
    if isinstance(conv_result, Exception):
        logger.warning('Conversations fetch failed for book %s', book_id, exc_info=conv_result)
        conversations: list[dict[str, Any]] = []
    else:
        conversations = conv_result

    sess_result = results[2]
    if isinstance(sess_result, Exception):
        logger.warning('Reading sessions fetch failed for book %s', book_id, exc_info=sess_result)
        reading_sessions, raw_sessions = [], []
    else:
        reading_sessions, raw_sessions = sess_result

    fc_result = results[3]
    if isinstance(fc_result, Exception):
        logger.warning('Flashcards fetch failed for book %s', book_id, exc_info=fc_result)
        flashcards: list[dict[str, Any]] = []
    else:
        flashcards = fc_result

    return {
        'highlights': highlights,
        'notes': notes,
        'conversations': conversations,
        'reading_sessions': reading_sessions,
        'raw_sessions': raw_sessions,
        'flashcards': flashcards,
    }


# ---------------------------------------------------------------------------
# Core orchestrators
# ---------------------------------------------------------------------------


async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw reading data from all sources."""
    book_meta = await _fetch_book_meta(db, user_id, book_id)
    if book_meta is None:
        return {}

    results = await asyncio.gather(
        _fetch_annotations(db, user_id, book_id),
        _fetch_conversations(db, user_id, book_id),
        _fetch_reading_sessions(db, user_id, book_id),
        _fetch_flashcards(db, user_id, book_id),
        return_exceptions=True,
    )

    unpacked = _unpack_gather_results(results, book_id)

    stats = _build_stats(
        unpacked['highlights'],
        unpacked['notes'],
        unpacked['conversations'],
        unpacked['raw_sessions'],
    )
    stats['total_flashcards'] = len(unpacked['flashcards'])

    return {
        'book': book_meta,
        'highlights': unpacked['highlights'],
        'notes': unpacked['notes'],
        'conversations': unpacked['conversations'],
        'reading_sessions': unpacked['reading_sessions'],
        'flashcards': unpacked['flashcards'],
        'stats': stats,
    }


async def _collect_enriched_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw data + enrich with knowledge graph, mastery, and synthesis."""
    data = await _collect_book_data(db, user_id, book_id)
    if not data.get('book'):
        return data

    enriched: dict[str, Any] = {**data}
    results = await _run_enrichment_steps(db, user_id, book_id, data)
    _merge_enrichment_results(enriched, results, book_id)
    return enriched
