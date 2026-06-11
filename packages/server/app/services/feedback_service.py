"""Feedback service — persist AI response feedback (thumbs up/down)."""

import logging
from uuid import UUID

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_feedback import AIFeedback

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
    feedback = AIFeedback(
        user_id=user_id,
        book_id=book_id,
        message_id=message_id,
        rating=rating,
        comment=comment,
    )
    db.add(feedback)
    try:
        await db.flush()
    except DBAPIError as exc:
        logger.error('feedback_service.submit_feedback DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    return {
        'id': str(feedback.id),
        'rating': rating,
    }
