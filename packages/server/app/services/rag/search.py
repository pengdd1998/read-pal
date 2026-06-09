"""Search strategies: semantic (pgVector) and keyword-based fallback."""

from typing import Any
from uuid import UUID

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rag._constants import logger, _tokenize_with_bigrams
from app.services.rag.embedding import _get_embedding
from app.models.book_chunk import BookChunk


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
    except Exception as exc:
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
    except Exception as exc:
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
