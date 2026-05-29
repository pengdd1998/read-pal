"""Feedback service — persist AI response feedback (thumbs up/down)."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_feedback import AIFeedback


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
    await db.flush()
    return {
        'id': str(feedback.id),
        'rating': rating,
    }
