"""Intervention feedback — storing and retrieving user feedback on interventions."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intervention_feedback import InterventionFeedback


async def store_feedback(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
    intervention_type: str,
    helpful: bool,
    dismissed: bool,
    context: object = None,
) -> dict:
    """Persist an intervention feedback record and return a confirmation dict."""
    feedback = InterventionFeedback(
        user_id=user_id,
        book_id=book_id,
        intervention_type=intervention_type,
        helpful=helpful,
        dismissed=dismissed,
        context=context,
    )
    db.add(feedback)
    await db.flush()
    return {'message': 'Feedback recorded'}


async def get_feedback_history(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 20,
) -> list[dict]:
    """Return the most recent feedback records for the given user."""
    stmt = (
        select(InterventionFeedback)
        .where(InterventionFeedback.user_id == user_id)
        .order_by(InterventionFeedback.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return [
        {
            'id': str(row.id),
            'interventionType': row.intervention_type,
            'userAction': 'helpful' if row.helpful else (
                'dismissed' if row.dismissed else 'seen'
            ),
            'createdAt': row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
