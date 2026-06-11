"""Data loading helpers for knowledge graph construction."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.knowledge')


async def _load_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    limit: int = 50,
) -> list[Annotation]:
    """Load annotations for a given user + book (capped to avoid token overflow)."""
    async with db_error_guard(
        '_loading._load_annotations',
        user_id=str(user_id),
        book_id=str(book_id),
    ):
        result = await db.execute(
            select(Annotation)
            .where(
                Annotation.user_id == user_id,
                Annotation.book_id == book_id,
            )
            .order_by(Annotation.created_at)
            .limit(limit),
        )
        return list(result.scalars().all())
