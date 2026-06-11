"""Enrichment orchestration steps for Reading Mirror data collection."""

from __future__ import annotations

import asyncio

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.memory_book.enrichment import (
    enrich_reading_metrics,
    enrich_with_knowledge_graph,
    enrich_with_synthesis_themes,
    fetch_other_books,
)

logger = structlog.get_logger('read-pal.memory_book')


async def _enrich_mastery_step(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Fetch mastery data with graceful fallback."""
    try:
        from app.services.study_mode_service import get_mastery
        return {'mastery': await get_mastery(db, user_id, book_id)}
    except (ValueError, RuntimeError):
        logger.warning('Mastery enrichment skipped for book %s', book_id, exc_info=True)
        return {'mastery': {}}


async def _enrich_synthesis_step(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Fetch synthesis themes with graceful fallback."""
    try:
        return {'synthesis_themes': await enrich_with_synthesis_themes(db, user_id, book_id)}
    except (ValueError, RuntimeError):
        logger.warning('Synthesis enrichment skipped for book %s', book_id, exc_info=True)
        return {'synthesis_themes': {}}


async def _run_enrichment_steps(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    data: dict[str, Any],
) -> list[Any]:
    """Run all enrichment coroutines in parallel and return gather results."""
    return await asyncio.gather(
        enrich_with_knowledge_graph(db, user_id, book_id),
        _enrich_mastery_step(db, user_id, book_id),
        _enrich_synthesis_step(db, user_id, book_id),
        enrich_reading_metrics(data.get('reading_sessions', []), data.get('highlights', [])),
        fetch_other_books(db, user_id, book_id),
        return_exceptions=True,
    )


def _merge_enrichment_results(
    enriched: dict[str, Any],
    results: list[Any],
    book_id: UUID,
) -> None:
    """Merge successful enrichment results into enriched dict."""
    for result in results:
        if isinstance(result, Exception):
            logger.warning(
                'Enrichment step failed for book %s', book_id, exc_info=result,
            )
            continue
        enriched.update(result)
