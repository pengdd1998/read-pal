"""Enrichment helpers — knowledge graph, synthesis, metrics, and other books."""

from __future__ import annotations

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book

logger = structlog.get_logger('read-pal.memory_book')


async def enrich_with_knowledge_graph(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Build knowledge graph concepts, nodes and edges for concept_web section."""
    result: dict[str, Any] = {
        'concepts': [],
        'concept_nodes': [],
        'concept_edges': [],
    }
    try:
        from app.services.knowledge_service import build_graph
        graph = await build_graph(db, user_id, book_id)
        result['concepts'] = [n.label for n in graph.nodes if n.label]
        result['concept_nodes'] = [
            {'label': n.label, 'type': n.type, 'size': n.size}
            for n in graph.nodes
        ]
        result['concept_edges'] = [
            {'source': e.source, 'target': e.target, 'label': e.label}
            for e in graph.edges if e.label
        ]
    except Exception as exc:
        logger.warning(
            'Knowledge graph enrichment skipped for book %s', book_id,
            exc_info=True,
        )
    return result


async def enrich_with_synthesis_themes(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[str]:
    """Extract theme names from synthesis results."""
    try:
        from app.services.synthesis_service import synthesize
        synthesis = await synthesize(db, user_id, book_id)
        syn_data = (
            getattr(synthesis, 'data', None)
            or (synthesis if isinstance(synthesis, dict) else None)
        )
        if isinstance(syn_data, dict):
            theme_list = syn_data.get('themes', [])
            return [
                t.get('name', '')
                for t in theme_list
                if isinstance(t, dict) and t.get('name')
            ]
    except Exception as exc:
        logger.warning(
            'Synthesis enrichment skipped for book %s', book_id,
            exc_info=True,
        )
    return []


async def enrich_reading_metrics(
    sessions: list[dict],
    highlights: list[dict],
) -> dict[str, Any]:
    """Compute reading pace, session details, and first highlight."""
    metrics: dict[str, Any] = {}
    if sessions:
        total_minutes = sum(s.get('duration', 0) for s in sessions) / 60
        total_pages = sum(s.get('pages_read', 0) for s in sessions)
        metrics['reading_pace'] = round(
            total_pages / max(total_minutes / 60, 0.1), 1,
        )
        metrics['longest_session_minutes'] = (
            max(s.get('duration', 0) for s in sessions) / 60
        )
        metrics['first_session_date'] = sessions[0].get('started_at')
        metrics['last_session_date'] = sessions[-1].get('started_at')
    else:
        metrics['reading_pace'] = 0
        metrics['longest_session_minutes'] = 0
        metrics['first_session_date'] = None
        metrics['last_session_date'] = None

    metrics['first_highlight'] = (
        highlights[0].get('content', '')[:200] if highlights else ''
    )
    return metrics


async def fetch_other_books(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Query user's other completed books for recommendations and threads."""
    result: dict[str, Any] = {'existing_books': [], 'other_books': []}
    try:
        rows = await db.execute(
            select(Book.id, Book.title, Book.author)
            .where(
                Book.user_id == user_id,
                Book.id != book_id,
                Book.status == 'completed',
            )
            .limit(20),
        )
        other_books = rows.all()
        result['existing_books'] = [r[1] for r in other_books]
        result['other_books'] = [
            {'id': str(r[0]), 'title': r[1], 'author': r[2] or 'Unknown'}
            for r in other_books
        ]
    except Exception as exc:
        logger.warning(
            'Failed to query existing books for user %s', user_id,
            exc_info=True,
        )
    return result
