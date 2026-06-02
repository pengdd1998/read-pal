"""Public API: retrieve relevant book context for AI chat enrichment."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.utils.sanitizer import sanitize_user_input
from app.core.redis import get_redis

from app.services.rag._constants import (
    RAG_CACHE_PREFIX,
    _rag_cache_ttl,
    _stable_hash,
    logger,
)
from app.services.rag.search import _semantic_chapter_search, _keyword_chapter_search
from app.services.rag._helpers import _get_chapters, _load_related_annotations


async def get_book_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    max_chars: int = 3000,
) -> str:
    """Retrieve relevant book content for enriching AI chat.

    Tries semantic search first, falls back to keyword matching.
    Filters results to only include content up to the user's reading
    position (spoiler prevention). Completed books have no filter.
    """
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        return ''

    # Determine max chapter index for spoiler prevention.
    # Completed books: no filter (user has read everything).
    # Use current_segment (chapter-level progress) not current_page (page number).
    is_completed = book.status == 'completed'
    max_chapter_index = book.current_segment if not is_completed else None

    cache_key = f'{RAG_CACHE_PREFIX}{book_id}:{user_id}:{_stable_hash(query)}:{max_chapter_index}'
    try:
        cached = await get_redis().get(cache_key)
        if cached:
            return cached[:max_chars]
    except Exception as exc:
        logger.warning('Redis RAG cache read failed: %s', exc)

    relevant_chunks = await _semantic_chapter_search(
        db, book_id, query, top_k=3, max_chapter_index=max_chapter_index,
    )

    if not relevant_chunks:
        chapters = await _get_chapters(db, book_id, max_chapter_index=max_chapter_index)
        if chapters:
            relevant_chunks = _keyword_chapter_search(chapters, query, top_k=3)

    context_parts: list[str] = []

    for item in relevant_chunks:
        chunk_text = item.get('content', '')
        if not chunk_text:
            continue
        header = f"[Chapter: {item.get('title', 'Untitled')}]"
        sanitized = sanitize_user_input(
            chunk_text[:max_chars], max_length=max_chars, context='rag_chapter',
        )
        context_parts.append(f'{header}\n{sanitized}')

    annotations = await _load_related_annotations(db, user_id, book_id, query, limit=5)
    for ann in annotations:
        label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
        entry = f'[{label}] {ann.content}'
        if ann.note:
            entry += f' (note: {ann.note})'
        context_parts.append(entry)

    combined = '\n\n'.join(context_parts)[:max_chars]

    if combined:
        try:
            await get_redis().setex(cache_key, _rag_cache_ttl(), combined)
        except Exception as exc:
            logger.warning('Redis RAG cache write failed: %s', exc)

    return combined
