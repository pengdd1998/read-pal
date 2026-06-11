"""Internal helpers: chapter fetching and annotation loading."""

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.document import Document

from app.services.rag._constants import _tokenize_query

logger = logging.getLogger('read-pal.rag')


async def _get_chapters(
    db: AsyncSession,
    book_id: UUID,
    max_chapter_index: int | None = None,
) -> list[dict[str, Any]]:
    """Fetch chapters from the Document table, optionally filtered by position."""
    try:
        result = await db.execute(
            select(Document.chapters).where(Document.book_id == book_id)
        )
        chapters = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.error('_helpers._get_chapters DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    if isinstance(chapters, list):
        if max_chapter_index is not None:
            return chapters[:max_chapter_index + 1]
        return chapters
    return []


async def _load_related_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
    limit: int = 5,
) -> list[Annotation]:
    """Load annotations with keyword overlap to the query."""
    try:
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
    except DBAPIError as exc:
        logger.error('_helpers._load_related_annotations DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc

    tokens = _tokenize_query(query)

    scored = []
    for ann in all_annotations:
        text = f'{ann.content} {ann.note or ""}'.lower()
        overlap = sum(1 for tok in tokens if tok in text)
        if overlap > 0:
            scored.append((overlap, ann))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ann for _, ann in scored[:limit]]
