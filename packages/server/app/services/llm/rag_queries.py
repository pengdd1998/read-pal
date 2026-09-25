"""G2: RAG observability queries (P-G, 2026-09-25)."""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def rag_book_health(db: AsyncSession) -> dict[str, Any]:
    """G2a: per-book chunk health — zero-chunk books surface first."""
    from app.models.book import Book
    from app.models.book_chunk import BookChunk

    books = (await db.execute(
        select(Book).where(Book.file_type == 'epub').order_by(Book.created_at.desc()).limit(200),
    )).scalars().all()

    items = []
    for b in books:
        scope = (
            (BookChunk.book_id == b.id) | (BookChunk.content_hash == b.content_hash)
            if b.content_hash
            else BookChunk.book_id == b.id
        )
        chunks = (await db.execute(
            select(func.count(BookChunk.id)).where(scope),
        )).scalar() or 0
        items.append({
            'book_id': str(b.id),
            'title': b.title,
            'content_hash': b.content_hash,
            'chunks': chunks,
            'status': 'zero_chunks' if chunks == 0 else 'ok',
        })

    items.sort(key=lambda x: (x['chunks'] == 0, -x['chunks']))
    zero_count = sum(1 for x in items if x['chunks'] == 0)
    return {'books': items[:100], 'zero_chunk_books': zero_count}


async def rag_replay_search(
    db: AsyncSession,
    *,
    book_id: str,
    query: str,
    top_k: int = 5,
    max_chapter_index: int | None = None,
    content_hash: str | None = None,
) -> dict[str, Any]:
    """G2b: replay one hybrid_chunk_search call (no LLM)."""
    from app.services.rag.search import hybrid_chunk_search

    t0 = time.monotonic()
    results = await hybrid_chunk_search(
        db, UUID(book_id), query,
        top_k=top_k,
        max_chapter_index=int(max_chapter_index) if max_chapter_index is not None else None,
        content_hash=content_hash,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)
    return {
        'results': results,
        'latency_ms': latency_ms,
        'result_count': len(results),
    }
