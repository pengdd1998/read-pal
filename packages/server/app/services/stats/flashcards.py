"""Flashcard retention metrics."""

import logging
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flashcard import Flashcard
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.stats.flashcards')


async def get_flashcard_stats(db: AsyncSession, uid: UUID) -> dict:
    """Return flashcard retention metrics for a user (single composite query)."""
    async with db_error_guard('flashcards.get_flashcard_stats'):
        row = (
            await db.execute(
                select(
                    func.count(Flashcard.id).label('total'),
                    func.count(case((Flashcard.repetition_count > 0, Flashcard.id))).label('reviewed'),
                    func.avg(Flashcard.ease_factor).label('avg_ease'),
                    func.count(case((Flashcard.next_review_at <= func.now(), Flashcard.id))).label('due_today'),
                    func.count(case(
                        (and_(Flashcard.repetition_count > 0, Flashcard.last_rating >= 3), Flashcard.id),
                    )).label('accurate'),
                    func.count(case((Flashcard.ease_factor >= 2.0, Flashcard.id))).label('well_learned'),
                ).where(Flashcard.user_id == uid)
            )
        ).one()

    total = row.total or 0
    reviewed = row.reviewed or 0
    avg_ease = float(row.avg_ease) if row.avg_ease else 0.0
    due_today = row.due_today or 0
    accurate = row.accurate or 0
    well_learned = row.well_learned or 0

    accuracy = (accurate / reviewed) if reviewed > 0 else 0.0
    retention = (well_learned / total) if total > 0 else 0.0

    return {
        'totalCards': total,
        'reviewedCards': reviewed,
        'averageEaseFactor': round(avg_ease, 2),
        'dueToday': due_today,
        'accuracy': round(accuracy * 100, 1),
        'retentionRate': round(retention * 100, 1),
    }
