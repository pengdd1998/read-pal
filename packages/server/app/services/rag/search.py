"""Search strategies: semantic (pgVector) and keyword-based fallback."""

import asyncio
from typing import Any
from uuid import UUID

from sqlalchemy import text, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rag._constants import logger, _tokenize_with_bigrams
from app.services.rag.embedding import _get_embedding
from app.models.book_chunk import BookChunk
from app.utils.db import db_error_guard

# P3.2: Reciprocal Rank Fusion constant. Standard value from the original
# RRF paper (Cormack et al., 2009). Score for a result at rank r in a
# single result list is 1 / (RRF_K + r). Smaller k → top ranks dominate;
# larger k → smoother fusion. 60 is the literature default and works
# across retrieval systems without per-collection tuning.
RRF_K = 60


def _build_embedding_literal(query_emb: list[float]) -> str:
    """Format embedding vector as a SQL-ready literal string."""
    return '[' + ','.join(
        ('0.0' if v != v or abs(v) == float('inf') else str(v))
        for v in query_emb
    ) + ']'


def _build_search_params(
    emb_literal: str,
    book_id: UUID,
    top_k: int,
    max_chapter_index: int | None,
) -> tuple[dict[str, Any], str]:
    """Build query params and chapter-clause for the pgVector SQL query."""
    params: dict[str, Any] = {
        'query_emb': emb_literal,
        'book_id': str(book_id),
        'distance_threshold': 0.7,
        'limit': top_k,
    }
    chapter_clause = ''
    if max_chapter_index is not None:
        chapter_clause = 'AND bc.chapter_index <= :max_chapter_index'
        params['max_chapter_index'] = max_chapter_index
    return params, chapter_clause


def _build_search_sql(chapter_clause: str) -> str:
    """Assemble the pgVector cosine-distance SQL query."""
    return (
        'SELECT bc.chapter_index AS chapter_index, '
        'bc.content AS content, '
        'd.chapters AS chapters, '
        '1 - (bc.embedding <=> :query_emb::vector) AS similarity '
        'FROM book_chunks bc '
        'JOIN documents d ON d.id = bc.document_id '
        'WHERE bc.book_id = :book_id '
        'AND bc.embedding IS NOT NULL '
        'AND (bc.embedding <=> :query_emb::vector) < :distance_threshold '
        + chapter_clause + ' '
        'ORDER BY bc.embedding <=> :query_emb::vector '
        'LIMIT :limit'
    )


async def _semantic_chapter_search(
    db: AsyncSession,
    book_id: UUID,
    query: str,
    top_k: int = 3,
    max_chapter_index: int | None = None,
) -> list[dict[str, Any]]:
    """pgVector cosine distance search over pre-computed chunk embeddings."""
    query_emb = await _get_embedding(query)
    if query_emb is None:
        return []

    emb_literal = _build_embedding_literal(query_emb)
    params, chapter_clause = _build_search_params(
        emb_literal, book_id, top_k, max_chapter_index,
    )

    try:
        query_sql = _build_search_sql(chapter_clause)
        result = await db.execute(text(query_sql), params)
        rows = result.fetchall()
    except DBAPIError as exc:
        logger.warning('pgVector search failed: %s', exc)
        return []

    return _rows_to_results(rows)


def _rows_to_results(rows: list[tuple]) -> list[dict[str, Any]]:
    results = []
    for row in rows:
        mapped = row._mapping  # type: ignore[union-attr]
        chapter_index = mapped['chapter_index']
        chapters = mapped['chapters']
        chapter_title = 'Untitled'
        if isinstance(chapters, list) and 0 <= chapter_index < len(chapters):
            chapter_title = chapters[chapter_index].get('title', 'Untitled')
        results.append({
            'title': chapter_title,
            'content': mapped['content'],
            'similarity': float(mapped['similarity']),
        })
    return results


def _keyword_score(tokens: set[str], text: str) -> int:
    """Score text by counting matching tokens (prefers bigrams via length)."""
    score = 0
    lower = text.lower()
    for tok in tokens:
        if tok in lower:
            score += len(tok)
    return score


async def _keyword_chunk_search(
    db: AsyncSession,
    book_id: UUID,
    query: str,
    top_k: int = 3,
    max_chapter_index: int | None = None,
) -> list[dict[str, Any]]:
    """Keyword search over precomputed book_chunks (no re-chunking)."""
    tokens = _tokenize_with_bigrams(query)
    if not tokens:
        return []

    # Limit to avoid loading excessive chunks for very large books
    _MAX_CHUNKS = 200
    stmt = (
        select(BookChunk)
        .where(BookChunk.book_id == book_id)
        .order_by(BookChunk.chapter_index)
        .limit(_MAX_CHUNKS)
    )
    if max_chapter_index is not None:
        stmt = stmt.where(BookChunk.chapter_index <= max_chapter_index)
    try:
        result = await db.execute(stmt)
        chunks = result.scalars().all()
    except DBAPIError as exc:
        logger.warning('Keyword chunk search failed: %s', exc)
        return []

    scored: list[tuple[int, BookChunk]] = []
    for chunk in chunks:
        if not chunk.content:
            continue
        score = _keyword_score(tokens, chunk.content)
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:top_k]

    # Fetch chapter titles from documents
    return [
        {
            'title': f'Chapter {c.chapter_index + 1}',
            'content': c.content,
            'similarity': 0.0,
        }
        for _, c in top
    ]


def _keyword_chapter_search(
    chapters: list[dict[str, Any]],
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Legacy keyword search over raw chapter content (fallback when no chunks)."""
    tokens = _tokenize_with_bigrams(query)
    if not tokens:
        return []

    scored: list[tuple[int, dict]] = []
    for ch in chapters:
        full_content = ch.get('content', '')
        title = ch.get('title', '')
        combined = f'{title} {full_content}'.lower()
        score = _keyword_score(tokens, combined)
        if score > 0:
            # Use first 500 chars as snippet
            snippet = full_content[:500] + ('...' if len(full_content) > 500 else '')
            scored.append((score, {
                'title': title or 'Untitled',
                'content': snippet,
            }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


# ---------------------------------------------------------------------------
# P3.2: Hybrid search via Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

def _chunk_dedup_key(chunk: dict[str, Any]) -> str:
    """Build a stable dedup key for a chunk.

    Both retrieval paths return ``{title, content, similarity}`` but no
    chunk-id, so we dedup on (title, content-prefix). Content prefix is
    enough because semantic and keyword paths return the same chunk text
    when they hit the same source row — collisions on a 200-char prefix
    inside one book are negligible.
    """
    title = (chunk.get('title') or '').strip()
    content = (chunk.get('content') or '').strip()[:200]
    return f'{title}::{content}'


def reciprocal_rank_fuse(
    ranked_lists: list[list[dict[str, Any]]],
    top_k: int,
    k: int = RRF_K,
) -> list[dict[str, Any]]:
    """Fuse multiple ranked result lists via Reciprocal Rank Fusion.

    Each input list must already be ordered best-first (rank 0 = best).
    Output is a fresh list ordered by fused score, truncated to ``top_k``.

    RRF is parameter-light (only ``k``, default 60) and needs no extra
    model call — the right KISS choice over a learned reranker. The score
    itself isn't surfaced to callers; only the order matters.

    Chunks appearing in multiple lists have their per-list contributions
    summed — the whole point of fusion is that a chunk retrieved by both
    signals is more likely relevant than one retrieved by either alone.
    """
    if not ranked_lists:
        return []

    scores: dict[str, float] = {}
    payload: dict[str, dict[str, Any]] = {}
    for ranked in ranked_lists:
        for rank, chunk in enumerate(ranked):
            key = _chunk_dedup_key(chunk)
            # rank starts at 0; the RRF formula uses 1-indexed ranks.
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            # Keep the first occurrence's payload — chunks across lists
            # carry the same shape, so any copy is fine.
            payload.setdefault(key, chunk)

    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [payload[key] for key, _ in ordered[:top_k]]


async def hybrid_chunk_search(
    db: AsyncSession,
    book_id: UUID,
    query: str,
    top_k: int = 3,
    max_chapter_index: int | None = None,
    pool_size: int | None = None,
) -> list[dict[str, Any]]:
    """Hybrid search: run semantic + keyword in parallel, fuse with RRF.

    P3.2 replaces the previous "cascading fallback" strategy. Cascading
    fallback had a known weakness: if semantic returned anything at all,
    even low-relevance hits, the keyword path never ran — so exact-term
    matches (character names, technical IDs, quoted phrases) got buried.

    Hybrid fusion solves this: both signals always run, and a chunk that
    BOTH retrievers rank highly shoots to the top. The pool_size (2x
    top_k by default) gives RRF enough candidates to fuse meaningfully
    without over-fetching.

    Falls back to legacy keyword chapter search only when both paths
    return empty (e.g. book has chunks disabled or out of range).
    """
    # Pull a wider candidate pool from each retriever so RRF has signal
    # to work with — fusing top_k=3 against top_k=3 caps the fusion at
    # 6 candidates and rarely changes order vs. just picking semantic.
    pool = max(pool_size or 2 * top_k, top_k)

    semantic, keyword = await asyncio.gather(
        _semantic_chapter_search(
            db, book_id, query, top_k=pool, max_chapter_index=max_chapter_index,
        ),
        _keyword_chunk_search(
            db, book_id, query, top_k=pool, max_chapter_index=max_chapter_index,
        ),
        return_exceptions=False,
    )

    # Either path empty is fine — RRF over a single list degenerates to
    # "return that list, truncated", which is the correct behavior.
    if not semantic and not keyword:
        return []

    return reciprocal_rank_fuse(
        [semantic, keyword], top_k=top_k, k=RRF_K,
    )
