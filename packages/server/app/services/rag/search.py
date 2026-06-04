"""Search strategies: semantic (pgVector) and keyword-based fallback."""

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rag._constants import _CJK_TOKEN_RE, logger
from app.services.rag.chunking import _chunk_text
from app.services.rag.embedding import _get_embedding


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

    emb_literal = '[' + ','.join(
        ('0.0' if v != v or abs(v) == float('inf') else str(v))
        for v in query_emb
    ) + ']'
    distance_threshold = 0.7  # 1 - similarity_threshold(0.3)

    # Build spoiler-prevention WHERE clause
    chapter_filter = ''
    params: dict[str, Any] = {
        'query_emb': emb_literal,
        'book_id': str(book_id),
        'distance_threshold': distance_threshold,
        'limit': top_k,
    }
    if max_chapter_index is not None:
        chapter_filter = 'AND bc.chapter_index <= :max_chapter_index'
        params['max_chapter_index'] = max_chapter_index

    try:
        stmt = text(f"""
            SELECT
                bc.chapter_index,
                bc.content,
                d.chapters,
                1 - (bc.embedding <=> :query_emb::vector) AS similarity
            FROM book_chunks bc
            JOIN documents d ON d.id = bc.document_id
            WHERE bc.book_id = :book_id
              AND bc.embedding IS NOT NULL
              AND (bc.embedding <=> :query_emb::vector) < :distance_threshold
              {chapter_filter}
            ORDER BY bc.embedding <=> :query_emb::vector
            LIMIT :limit
        """)
        result = await db.execute(
            stmt,
            params,
        )
        rows = result.fetchall()
    except Exception as exc:
        logger.warning('pgVector search failed: %s', exc)
        return []

    results = []
    for row in rows:
        chapter_index = row[0]
        chapters = row[2]
        chapter_title = 'Untitled'
        if isinstance(chapters, list) and 0 <= chapter_index < len(chapters):
            chapter_title = chapters[chapter_index].get('title', 'Untitled')

        results.append({
            'title': chapter_title,
            'content': row[1],
            'similarity': float(row[3]),
        })

    return results


def _tokenize_query(query: str) -> set[str]:
    return set(_CJK_TOKEN_RE.findall(query.lower()))


def _keyword_chapter_search(
    chapters: list[dict[str, Any]],
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Keyword-based chapter relevance scoring."""
    tokens = _tokenize_query(query)

    scored: list[tuple[float, dict]] = []
    for ch in chapters:
        full_content = ch.get('content', '')
        chunks = _chunk_text(full_content) if full_content else []
        title = ch.get('title', '')
        for chunk in chunks:
            text = f"{title} {chunk}".lower()
            overlap = sum(1 for tok in tokens if tok in text)
            if overlap > 0:
                scored.append((overlap, {
                    'title': title or 'Untitled',
                    'content': chunk,
                }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]
