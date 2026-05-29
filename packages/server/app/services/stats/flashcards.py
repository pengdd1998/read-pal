"""Flashcard retention metrics."""

from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flashcard import Flashcard


async def get_flashcard_stats(db: AsyncSession, uid: UUID) -> dict:
    """Return flashcard retention metrics for a user."""
    # Total cards
    total = await db.scalar(
        select(func.count(Flashcard.id)).where(Flashcard.user_id == uid)
    )
    total = total or 0

    # Cards reviewed at least once
    reviewed = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(Flashcard.user_id == uid, Flashcard.repetition_count > 0)
        )
    )
    reviewed = reviewed or 0

    # Average ease factor
    avg_ease = await db.scalar(
        select(func.avg(Flashcard.ease_factor)).where(Flashcard.user_id == uid)
    )
    avg_ease = float(avg_ease) if avg_ease else 0.0

    # Cards due today
    due_today = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.user_id == uid,
                Flashcard.next_review_at <= func.now(),
            )
        )
    )
    due_today = due_today or 0

    # Accuracy: cards with last_rating >= 3 / total reviewed
    accurate = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.user_id == uid,
                Flashcard.repetition_count > 0,
                Flashcard.last_rating >= 3,
            )
        )
    )
    accurate = accurate or 0
    accuracy = (accurate / reviewed) if reviewed > 0 else 0.0

    # Retention rate: cards with ease_factor >= 2.0 / total cards
    well_learned = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(Flashcard.user_id == uid, Flashcard.ease_factor >= 2.0)
        )
    )
    well_learned = well_learned or 0
    retention = (well_learned / total) if total > 0 else 0.0

    return {
        'totalCards': total,
        'reviewedCards': reviewed,
        'averageEaseFactor': round(avg_ease, 2),
        'dueToday': due_today,
        'accuracy': round(accuracy * 100, 1),
        'retentionRate': round(retention * 100, 1),
    }
