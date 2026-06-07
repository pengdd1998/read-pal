"""Data-fetching helpers for intervention analysis."""

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession
from app.utils import utcnow


def _build_session_query(
    user_id: UUID,
    since,
    book_id: UUID | None = None,
):
    """Build a ReadingSession query scoped to *user_id* and *since*."""
    q = select(ReadingSession).where(
        ReadingSession.user_id == user_id,
        ReadingSession.started_at >= since,
    )
    if book_id:
        q = q.where(ReadingSession.book_id == book_id)
    return q


async def fetch_recent_sessions(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
) -> tuple[list, list]:
    """Return (weekly_sessions, today_sessions) for the given user/book."""
    now = utcnow()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    q = _build_session_query(user_id, week_ago, book_id)
    sessions = (await db.execute(q)).scalars().all()

    today_q = _build_session_query(user_id, day_ago, book_id)
    today_sessions = (await db.execute(today_q)).scalars().all()
    return sessions, today_sessions


async def fetch_extended_sessions(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
) -> list:
    """Fetch sessions from the last 14 days for timing analysis."""
    two_weeks_ago = utcnow() - timedelta(days=14)
    q = _build_session_query(user_id, two_weeks_ago, book_id)
    return (await db.execute(q)).scalars().all()
