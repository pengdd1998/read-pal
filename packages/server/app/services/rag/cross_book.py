"""Cross-book retrieval — multi-book search for the Phase 2 Research agent.

``hybrid_chunk_search`` (P3.2) is scoped to one book; this module fans it
out across the user's library and fuses the per-book ranked lists with the
same RRF math. Ownership gating happens once, at the Book layer: books not
on the caller's shelf are never searched, and shared chunks of the same
content_hash are only reachable through a book the user owns (same
contract as single-book RAG — see ``rag/context.py`` and
``docs/design/cross-user-content-sharing.md`` §3.1).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.services.rag._constants import logger
from app.services.rag.search import hybrid_chunk_search, reciprocal_rank_fuse

# Fan-out caps. max_books bounds the DB work (each book runs semantic +
# keyword in parallel); total_k bounds the fused excerpt list handed to
# the Research agent's synthesis call.
DEFAULT_MAX_BOOKS = 8
DEFAULT_PER_BOOK_K = 2
DEFAULT_TOTAL_K = 10


def _spoiler_limit(book: Book) -> int | None:
    """Same spoiler contract as single-book RAG (rag/context.py).

    In-progress books only search up to the reader's current chapter;
    completed books have no filter. P3.5: ``Book.status`` loads as a
    ``BookStatus`` member — compare against the enum, never the string
    (a str comparison is silently always-False).
    """
    if book.status == BookStatus.completed:
        return None
    return book.current_segment


async def _load_research_scope(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID] | None,
    max_books: int,
) -> list[Book]:
    """Load the books eligible for research: owned, requested, capped.

    ``book_ids`` narrows the scope but can never widen it — ids the user
    does not own are silently dropped (no existence leak, matching the
    single-book 404-on-foreign-book behavior).
    """
    stmt = select(Book).where(Book.user_id == user_id)
    if book_ids:
        stmt = stmt.where(Book.id.in_(book_ids))
    # Most-recently-added first so the cap keeps the books the reader is
    # most likely asking about.
    stmt = stmt.order_by(Book.created_at.desc()).limit(max_books)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def cross_book_search(
    db: AsyncSession,
    user_id: UUID,
    query: str,
    book_ids: list[UUID] | None = None,
    per_book_k: int = DEFAULT_PER_BOOK_K,
    max_books: int = DEFAULT_MAX_BOOKS,
    total_k: int = DEFAULT_TOTAL_K,
) -> list[dict]:
    """Search the user's library and return fused, attributed excerpts.

    Each result carries the chunk shape from ``hybrid_chunk_search``
    (``{title, content, similarity}``) plus book attribution:
    ``book_id`` / ``book_title`` / ``author``. RRF dedup is
    (chapter title, content) — identical passages surfaced via two book
    rows sharing a content_hash collapse to one excerpt carrying the
    first book's attribution.
    """
    books = await _load_research_scope(db, user_id, book_ids, max_books)
    if not books:
        return []

    # Embed the query ONCE and share it across every book — the previous
    # per-book path re-embedded the identical query for each of up to 8
    # books (8 embedding API calls per research question).
    from app.services.rag.embedding import get_embeddings
    query_emb = (await get_embeddings([query], retry_delays=(1.0,)) or [None])[0]

    # SEQUENTIAL fan-out: AsyncSession forbids concurrent operations, and
    # the previous asyncio.gather raced up to 16 concurrent executes on
    # this one session (per-book × hybrid's internal pair). With the
    # shared embedding each iteration is two millisecond-scale queries.
    # Per-book isolation is preserved via try/except: one book's index
    # being broken must not sink the whole research pass.
    usable: list[list[dict]] = []
    for book in books:
        try:
            chunks = await hybrid_chunk_search(
                db,
                book.id,
                query,
                top_k=per_book_k,
                max_chapter_index=_spoiler_limit(book),
                content_hash=book.content_hash,
                query_emb=query_emb,
            )
        except Exception as exc:  # noqa: BLE001 — one book must not sink the pass
            logger.warning(
                "Cross-book search failed for book %s: %s",
                book.id,
                exc,
            )
            continue
        for chunk in chunks:
            chunk["book_id"] = str(book.id)
            chunk["book_title"] = book.title
            chunk["author"] = book.author
        if chunks:
            usable.append(chunks)

    return reciprocal_rank_fuse(usable, top_k=total_k)
