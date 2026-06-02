"""Cross-book theme detection across all of a user's books."""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.services.knowledge._cache import _content_hash, _load_cached_graph

logger = structlog.get_logger('read-pal.knowledge')


async def _batch_load_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
    limit_per_book: int = 50,
) -> dict[UUID, list[Annotation]]:
    """Load annotations for multiple books in a single query, then group by book_id.

    Replaces N individual ``_load_annotations`` calls with one batch query.
    """
    if not book_ids:
        return {}
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id.in_(book_ids),
        )
        .order_by(Annotation.book_id, Annotation.created_at),
    )
    grouped: dict[UUID, list[Annotation]] = defaultdict(list)
    for ann in result.scalars().all():
        grouped[ann.book_id].append(ann)
    # Cap per-book to avoid token overflow (same as _load_annotations)
    return {bid: anns[:limit_per_book] for bid, anns in grouped.items()}


async def get_cross_book_themes(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, Any]:
    """Find themes and connections across all user's books.

    Strategy:
      1. Batch-load annotations for all books in a single query.
      2. Load cached graphs for each book (Redis calls are unavoidable per-book).
      3. Find concept nodes that appear across multiple books (label overlap).
      4. Return shared themes and cross-book connections.
    """
    from app.models.book import Book as BookModel

    result = await db.execute(
        select(BookModel.id, BookModel.title).where(BookModel.user_id == user_id),
    )
    book_rows = result.all()
    if not book_rows:
        return {'themes': [], 'connections': []}

    # Batch-load annotations for all books in a single DB query
    book_ids = [row[0] for row in book_rows]
    book_title_map: dict[str, str] = {str(bid): title for bid, title in book_rows}
    annotations_by_book = await _batch_load_annotations(db, user_id, book_ids)

    # Collect per-book concept sets
    book_concepts: dict[str, dict[str, dict]] = {}  # label -> {book_id: {node, bookTitle}}
    for book_id, book_title in book_rows:
        try:
            annotations = annotations_by_book.get(book_id, [])
            texts = [a.content for a in annotations if a.content.strip()]
            if not texts:
                continue
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(user_id, book_id, current_hash)
            if cached is None or not cached.nodes:
                continue
            for node in cached.nodes:
                if node.label not in book_concepts:
                    book_concepts[node.label] = {}
                book_concepts[node.label][str(book_id)] = {
                    'node': node,
                    'bookTitle': book_title,
                }
        except Exception:
            logger.warning('Failed to load graph for book %s', book_id, exc_info=True)
            continue

    # Find themes: concepts appearing in 2+ books
    themes = []
    for label, book_map in book_concepts.items():
        if len(book_map) >= 2:
            theme_books = [
                {'bookId': bid, 'bookTitle': info['bookTitle']}
                for bid, info in book_map.items()
            ]
            total_size = sum(info['node'].size for info in book_map.values())
            themes.append({
                'label': label,
                'books': theme_books,
                'strength': total_size,
            })

    themes.sort(key=lambda t: t['strength'], reverse=True)

    # Find connections: related concepts from different books
    connections = []
    seen_pairs: set[frozenset[str]] = set()
    for label, book_map in book_concepts.items():
        if len(book_map) < 2:
            continue
        for edge_label, edge_books in book_concepts.items():
            if edge_label == label:
                continue
            shared = set(book_map.keys()) & set(edge_books.keys())
            if len(shared) >= 2:
                pair = frozenset([label, edge_label])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                connections.append({
                    'source': label,
                    'target': edge_label,
                    'books': list(shared),
                })

    logger.info(
        'knowledge.get_cross_book_themes.completed',
        theme_count=len(themes),
        connection_count=len(connections),
        user_id=str(user_id),
    )
    return {'themes': themes[:20], 'connections': connections[:30]}
