"""Tool implementations — thin, read-only wrappers over existing services.

Contract for every implementation:
- ``(db, user_id, book_id, args) -> dict`` — the dict is the renderable
  payload handed to the prompt (keep it SMALL: skeleton-first, the model
  can call search_book/get_chapter for detail).
- Ownership is non-negotiable: every query filters ``user_id``; the
  ``book_id`` always comes from the route, never from model args.
- Never raise: the registry wraps calls, but implementations avoid
  partial-state surprises by returning error payloads themselves only
  when it's semantic (e.g. "not generated yet").
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation

# Per-tool render caps — keep tool results prompt-sized.
_SEARCH_TOP_K = 3
_SEARCH_EXCERPT_CHARS = 300
_ANNOTATION_LIMIT = 10
_ANNOTATION_CHARS = 120
_CHAPTER_CHARS = 2000
_GRAPH_TOP_NODES = 10
_FLASHCARD_LIMIT = 10
_FLASHCARD_CHARS = 120


async def search_book(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Semantic search over the current book (or the whole library)."""
    from app.services.rag.cross_book import cross_book_search
    from app.services.rag.search import hybrid_chunk_search

    query = str(args.get('query', '')).strip()
    scope = args.get('scope', 'current')
    if scope == 'library':
        chunks = await cross_book_search(db, user_id, query, per_book_k=1, total_k=_SEARCH_TOP_K)
    else:
        chunks = await hybrid_chunk_search(db, book_id, query, top_k=_SEARCH_TOP_K)

    hits = [
        {
            'book': c.get('book_title') or 'current book',
            'chapter': c.get('title', ''),
            'excerpt': (c.get('content') or '')[:_SEARCH_EXCERPT_CHARS],
            'relevance': round(float(c.get('similarity') or 0.0), 3),
        }
        for c in chunks
    ]
    return {'query': query, 'scope': scope, 'hits': hits}


async def get_annotations(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """The reader's recent highlights/notes on the current book."""
    ann_type = args.get('type')
    stmt = (
        select(Annotation)
        .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
        .order_by(Annotation.created_at.desc())
        .limit(_ANNOTATION_LIMIT)
    )
    if ann_type:
        stmt = stmt.where(Annotation.type == ann_type)

    rows = (await db.execute(stmt)).scalars().all()
    items = [
        {
            'type': ann.type.value if hasattr(ann.type, 'value') else str(ann.type),
            'content': (ann.content or '')[:_ANNOTATION_CHARS],
            'note': (ann.note or None) and ann.note[:_ANNOTATION_CHARS],
            'chapter': getattr(ann, 'chapter_index', None),
        }
        for ann in rows
    ]
    return {'items': items}


def _chapter_withheld(index: int, current_page: int, is_completed: bool) -> bool:
    """TL4-02 / P7.4: chapters beyond the reader's progress stay withheld
    unless the book is completed. ``index`` is 1-based; ``current_page`` is
    the 0-based chapter index the reader is on (same semantics as the RAG
    spoiler limit in rag/context.py)."""
    return not is_completed and (index - 1) > current_page


async def get_chapter(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Chapter text by 1-based index (ownership + range verified)."""
    from app.models.book import Book
    from app.models.document import Document

    index = int(args.get('index', 0))

    book = (await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )).scalar_one_or_none()
    if book is None:
        return {'error': 'book not found'}

    doc = (await db.execute(
        select(Document).where(Document.book_id == book_id)
    )).scalar_one_or_none()
    chapters = (doc.chapters if doc else None) or []
    if not (1 <= index <= len(chapters)):
        return {'error': f'index out of range: 1..{len(chapters)}'}

    chapter = chapters[index - 1]

    # TL4-02 / P7.4 contract: the tool must not be a spoiler bypass. The
    # requested chapter sits beyond the reader's progress and the book is
    # not completed — return a boundary-held stub instead of full text
    # (title only, so legitimate "did I finish chapter 7" lookups still work).
    from app.models.book import BookStatus
    if _chapter_withheld(index, book.current_page, book.status == BookStatus.completed):
        return {
            'index': index,
            'title': chapter.get('title', ''),
            'held': 'unread-chapter',
            'note': 'Chapter beyond reading progress — full text withheld '
                    '(spoiler boundary). Encourage the reader to keep reading.',
            'total_chapters': len(chapters),
        }

    return {
        'index': index,
        'title': chapter.get('title', ''),
        'content': (chapter.get('content') or '')[:_CHAPTER_CHARS],
        'total_chapters': len(chapters),
    }


async def get_reading_progress(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Progress/state for the current book (spoiler-gate data source)."""
    from app.models.book import Book

    book = (await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )).scalar_one_or_none()
    if book is None:
        return {'error': 'book not found'}
    status = book.status.value if hasattr(book.status, 'value') else str(book.status)
    return {
        'progress_percent': book.progress,
        'current_page': book.current_page,
        'total_pages': book.total_pages,
        'status': status,
    }


async def get_knowledge_graph(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Skeleton of the reader's concept web (cache-only, no LLM)."""
    from app.services.knowledge import get_all_cached_graphs

    graph = await get_all_cached_graphs(db, user_id)
    nodes = graph.get('nodes') or []
    edges = graph.get('edges') or []
    if not nodes:
        return {'generated': False, 'hint': 'no cached concept web yet'}

    # Degree = how connected a node is; surface the load-bearing concepts.
    degree: dict[str, int] = {}
    for e in edges:
        degree[e.get('source', '')] = degree.get(e.get('source', ''), 0) + 1
        degree[e.get('target', '')] = degree.get(e.get('target', ''), 0) + 1
    ranked = sorted(nodes, key=lambda n: degree.get(n.get('id', ''), 0), reverse=True)
    return {
        'generated': True,
        'total_nodes': len(nodes),
        'total_edges': len(edges),
        'top_concepts': [
            {'label': n.get('label', ''), 'type': n.get('type', '')}
            for n in ranked[:_GRAPH_TOP_NODES]
        ],
    }


async def get_memory_book(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Skeleton of the reading mirror — section titles + stats, no HTML."""
    from app.services.reading_book_service import get_memory_book as fetch

    mb = await fetch(db, user_id, book_id)
    if mb is None:
        return {'generated': False, 'hint': 'no reading mirror for this book yet'}

    stats = mb.get('stats') or {}
    return {
        'generated': True,
        'generated_at': mb.get('generatedAt') or mb.get('generated_at'),
        'sections': [s.get('title', '') for s in (mb.get('sections') or [])][:10],
        'highlights': stats.get('totalHighlights'),
        'notes': stats.get('totalNotes'),
        'reading_minutes': stats.get('readingDuration'),
    }


async def get_flashcards(
    db: AsyncSession, user_id: UUID, book_id: UUID, args: dict[str, Any],
) -> dict[str, Any]:
    """Flashcard state: due count + card fronts (no answers — that's the
    reader's review to do, not the companion's to spoil)."""
    from app.services.flashcard import get_due_cards, list_flashcards

    if args.get('filter', 'due') == 'all':
        cards, total = await list_flashcards(db, user_id, page=1, per_page=_FLASHCARD_LIMIT)
        return {
            'filter': 'all',
            'total': total,
            'cards': [{'question': (c.question or '')[:_FLASHCARD_CHARS]} for c in cards],
        }

    due = await get_due_cards(db, user_id, limit=_FLASHCARD_LIMIT)
    return {
        'filter': 'due',
        'due_count': len(due),
        'cards': [{'question': (c.question or '')[:_FLASHCARD_CHARS]} for c in due],
    }
