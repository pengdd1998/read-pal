"""Public API: retrieve relevant book context for AI chat enrichment."""

from uuid import UUID

import redis.exceptions
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.utils.annotation_format import format_annotation_entry
from app.utils.sanitizer import sanitize_user_input
from app.core.redis import get_redis

from app.services.rag._constants import (
    RAG_CACHE_PREFIX,
    _rag_cache_ttl,
    _stable_hash,
    logger,
)
from app.services.rag.search import (
    _semantic_chapter_search,
    _keyword_chunk_search,
    _keyword_chapter_search,
)
from app.services.rag._helpers import _get_chapters, _load_related_annotations


async def _fetch_book_and_spoiler_limit(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> tuple[Book | None, int | None]:
    """Fetch the book and compute the spoiler-prevention chapter limit.

    Returns (book, max_chapter_index). Completed books have no filter.
    Returns (None, None) when the book is not found.
    """
    try:
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id)
        )
        book = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.error('context._fetch_book_and_spoiler_limit DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    if not book:
        return None, None

    # Use current_segment (chapter-level progress) not current_page.
    is_completed = book.status == 'completed'
    max_chapter_index = book.current_segment if not is_completed else None
    return book, max_chapter_index


def _build_cache_key(
    book_id: UUID,
    user_id: UUID,
    query: str,
    max_chapter_index: int | None,
) -> str:
    """Build a stable Redis cache key for a RAG query."""
    return (
        f'{RAG_CACHE_PREFIX}{book_id}:{user_id}'
        f':{_stable_hash(query)}:{max_chapter_index}'
    )


async def _check_rag_cache(cache_key: str, max_chars: int) -> str | None:
    """Return cached RAG context if available, otherwise None."""
    try:
        cached = await get_redis().get(cache_key)
        if cached:
            return cached[:max_chars]
    except redis.exceptions.RedisError as exc:
        logger.warning('Redis RAG cache read failed: %s', exc)
    return None


async def _search_relevant_chunks(
    db: AsyncSession,
    book_id: UUID,
    query: str,
    top_k: int,
    max_chapter_index: int | None,
) -> list[dict]:
    """Search for relevant chunks using a 3-level fallback strategy.

    Tries semantic search first, then keyword chunk search,
    then keyword chapter search as a last resort.
    """
    chunks = await _semantic_chapter_search(
        db, book_id, query, top_k=top_k, max_chapter_index=max_chapter_index,
    )
    if chunks:
        return chunks

    chunks = await _keyword_chunk_search(
        db, book_id, query, top_k=top_k, max_chapter_index=max_chapter_index,
    )
    if chunks:
        return chunks

    chapters = await _get_chapters(db, book_id, max_chapter_index=max_chapter_index)
    if chapters:
        return _keyword_chapter_search(chapters, query, top_k=top_k)

    return []


def _format_chunks_as_context(
    chunks: list[dict],
    max_chars: int,
) -> list[str]:
    """Format search result chunks into labeled context strings."""
    parts: list[str] = []
    for item in chunks:
        chunk_text = item.get('content', '')
        if not chunk_text:
            continue
        header = f"[Chapter: {item.get('title', 'Untitled')}]"
        sanitized = sanitize_user_input(
            chunk_text[:max_chars], max_length=max_chars, context='rag_chapter',
        )
        parts.append(f'{header}\n{sanitized}')
    return parts


def _format_annotations_as_context(annotations: list) -> list[str]:
    """Format annotation objects into labeled context strings."""
    return [format_annotation_entry(ann) for ann in annotations]


async def _save_rag_cache(cache_key: str, content: str) -> None:
    """Write RAG context to Redis cache with TTL."""
    try:
        await get_redis().setex(cache_key, _rag_cache_ttl(), content)
    except redis.exceptions.RedisError as exc:
        logger.warning('Redis RAG cache write failed: %s', exc)


async def get_book_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    max_chars: int = 3000,
    top_k: int = 3,
) -> str:
    """Retrieve relevant book content for enriching AI chat.

    Tries semantic search first, falls back to keyword matching.
    Filters results to only include content up to the user's reading
    position (spoiler prevention). Completed books have no filter.
    """
    book, max_chapter_index = await _fetch_book_and_spoiler_limit(db, user_id, book_id)
    if not book:
        return ''

    cache_key = _build_cache_key(book_id, user_id, query, max_chapter_index)

    cached = await _check_rag_cache(cache_key, max_chars)
    if cached is not None:
        return cached

    relevant_chunks = await _search_relevant_chunks(
        db, book_id, query, top_k, max_chapter_index,
    )

    context_parts = _format_chunks_as_context(relevant_chunks, max_chars)

    annotations = await _load_related_annotations(db, user_id, book_id, query, limit=5)
    context_parts.extend(_format_annotations_as_context(annotations))

    combined = '\n\n'.join(context_parts)[:max_chars]

    if combined:
        await _save_rag_cache(cache_key, combined)

    return combined
