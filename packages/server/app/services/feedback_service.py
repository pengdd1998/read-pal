"""Feedback service — persist AI response feedback (thumbs up/down)."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_feedback import AIFeedback
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.feedback')


async def submit_feedback(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message_id: str | None,
    rating: bool,
    comment: str | None = None,
) -> dict:
    """Create and persist an AIFeedback record."""
    # Upsert semantics: re-rating the same message updates the existing row
    # (ordinary CRUD) instead of stacking duplicates. Legacy rows may contain
    # MULTIPLE feedback rows per message (pre-upsert duplicates) — collapse
    # them: update the newest, delete the rest. scalar_one_or_none() would
    # 500 on that history (found live, 2026-09-01).
    if message_id:
        existing = await db.execute(
            select(AIFeedback)
            .where(
                AIFeedback.user_id == user_id,
                AIFeedback.message_id == message_id,
            )
            .order_by(AIFeedback.created_at.desc())
        )
        rows = list(existing.scalars().all())
        if rows:
            primary = rows[0]
            primary.rating = rating
            if comment is not None:
                primary.comment = comment
            for dup in rows[1:]:
                await db.delete(dup)
            async with db_error_guard('feedback_service.submit_feedback'):
                await db.flush()
            return {'id': str(primary.id), 'rating': rating, 'updated': True}

    feedback = AIFeedback(
        user_id=user_id,
        book_id=book_id,
        message_id=message_id,
        rating=rating,
        comment=comment,
    )
    db.add(feedback)
    async with db_error_guard('feedback_service.submit_feedback'):
        await db.flush()
    return {
        'id': str(feedback.id),
        'rating': rating,
    }


async def delete_feedback(
    db: AsyncSession,
    user_id: UUID,
    message_id: str,
) -> int:
    """Remove the user's rating for a message (toggle-off). Returns rows removed."""
    async with db_error_guard('feedback_service.delete_feedback'):
        result = await db.execute(
            select(AIFeedback).where(
                AIFeedback.user_id == user_id,
                AIFeedback.message_id == message_id,
            )
        )
        rows = list(result.scalars().all())
        for row in rows:
            await db.delete(row)
        await db.flush()
    return len(rows)
