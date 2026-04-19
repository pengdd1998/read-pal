"""RAG service — retrieve relevant book content for AI chat enrichment."""

import json
import logging
from typing import Any
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.annotation import Annotation
from app.models.book import Book

logger = logging.getLogger('read-pal.rag')

RAG_CACHE_PREFIX = 'rag:'
RAG_CACHE_TTL = 1800  # 30 min

_redis_client: aioredis.Redis | None = None

def _get_redis() -> aioredis.Redis:
    """Lazily initialise shared Redis client."""
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


async def get_book_context(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    max_chars: int = 3000,
) -> str:
    """Retrieve relevant book content for enriching AI chat.

    Strategy:
    1. Load chapter-level content from book metadata (stored in Book.chapters or metadata)
    2. Simple keyword matching against chapter text
    3. Load related annotations
    4. Return combined context string

    Falls back to annotations-only if no chapter content available.
    """
    # Check Redis cache first
    cache_key = f'{RAG_CACHE_PREFIX}{book_id}:{hash(query)}'
    try:
        cached = await _get_redis().get(cache_key)
        if cached:
            return cached[:max_chars]
    except Exception:
        pass

    # Load book
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if not book:
        return ''

    context_parts: list[str] = []

    # 1. Chapter content - search for relevant chapters
    chapters = _get_chapters(book)
    if chapters:
        relevant = _find_relevant_chapters(chapters, query, top_k=3)
        for ch in relevant:
            if ch.get('content'):
                header = f"[Chapter: {ch.get('title', 'Untitled')}]"
                content = ch['content'][:1000]
                context_parts.append(f'{header}\n{content}')

    # 2. Related annotations (highlights/notes with keyword overlap)
    annotations = await _load_related_annotations(db, user_id, book_id, query, limit=5)
    for ann in annotations:
        label = ann.type.value if hasattr(ann.type, 'value') else str(ann.type)
        entry = f'[{label}] {ann.content}'
        if ann.note:
            entry += f' (note: {ann.note})'
        context_parts.append(entry)

    combined = '\n\n'.join(context_parts)[:max_chars]

    # Cache result
    if combined:
        try:
            await _get_redis().setex(cache_key, RAG_CACHE_TTL, combined)
        except Exception:
            pass

    return combined


def _get_chapters(book: Book) -> list[dict[str, Any]]:
    """Extract chapters from book metadata."""
    metadata = {}
    if hasattr(book, 'metadata') and book.metadata:
        if isinstance(book.metadata, dict):
            metadata = book.metadata
        elif isinstance(book.metadata, str):
            try:
                metadata = json.loads(book.metadata)
            except (json.JSONDecodeError, TypeError):
                pass
    return metadata.get('chapters', [])


def _find_relevant_chapters(
    chapters: list[dict[str, Any]],
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Simple keyword-based chapter relevance scoring."""
    query_words = set(query.lower().split())
    scored: list[tuple[float, dict]] = []

    for ch in chapters:
        text = f"{ch.get('title', '')} {ch.get('content', '')}".lower()
        words = set(text.split())
        overlap = len(query_words & words)
        if overlap > 0:
            scored.append((overlap, ch))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ch for _, ch in scored[:top_k]]


async def _load_related_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    limit: int = 5,
) -> list[Annotation]:
    """Load annotations with keyword overlap to the query."""
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id == book_id,
        )
        .order_by(Annotation.created_at.desc())
        .limit(50)
    )
    all_annotations = list(result.scalars().all())

    # Score by keyword overlap
    query_words = set(query.lower().split())
    scored = []
    for ann in all_annotations:
        text = f'{ann.content} {ann.note or ""}'.lower()
        words = set(text.split())
        overlap = len(query_words & words)
        if overlap > 0:
            scored.append((overlap, ann))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ann for _, ann in scored[:limit]]
