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
    # (ordinary CRUD) instead of stacking duplicates.
    if message_id:
        existing = await db.execute(
            select(AIFeedback).where(
                AIFeedback.user_id == user_id,
                AIFeedback.message_id == message_id,
            )
        )
        row = existing.scalar_one_or_none()
        if row is not None:
            row.rating = rating
            if comment is not None:
                row.comment = comment
            async with db_error_guard('feedback_service.submit_feedback'):
                await db.flush()
            return {'id': str(row.id), 'rating': rating, 'updated': True}

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
