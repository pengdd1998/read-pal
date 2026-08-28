"""Database query helpers for dashboard stats."""

import logging
from datetime import date, datetime, timedelta, UTC
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.chat_message import ChatMessage
from app.models.memory_book import MemoryBook
from app.models.reading_session import ReadingSession
from app.services.stats.streaks import compute_streaks
from app.utils.time import utcnow_aware

logger = logging.getLogger(__name__)


async def get_book_status_counts(db: AsyncSession, uid: UUID) -> dict[str, int]:
    """Return book counts grouped by status."""
    rows = await db.execute(
        select(Book.status, func.count(Book.id))
        .where(Book.user_id == uid)
        .group_by(Book.status),
    )
    counts = {row[0]: row[1] for row in rows.all()}
    return {
        'total': sum(counts.values()),
        'reading': counts.get(BookStatus.reading, 0),
        'completed': counts.get(BookStatus.completed, 0),
        'unread': counts.get(BookStatus.unread, 0),
    }


async def get_pages_read(db: AsyncSession, uid: UUID) -> int:
    """Total pages read from sessions, with book-progress fallback."""
    total = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.pages_read), 0)).where(
            ReadingSession.user_id == uid,
        ),
    )
    if total:
        return int(total)
    fallback = await db.scalar(
        select(func.coalesce(func.sum(Book.current_page), 0)).where(
            and_(Book.user_id == uid, Book.current_page > 0),
        ),
    )
    return int(fallback or 0)


async def get_reading_minutes(db: AsyncSession, uid: UUID) -> int:
    """Total reading time in minutes."""
    seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            ReadingSession.user_id == uid,
        ),
    )
    return int(seconds) // 60 if seconds else 0


async def compute_current_streak(db: AsyncSession, uid: UUID) -> int:
    """Current reading streak (consecutive days ending today)."""
    day_col = func.date(ReadingSession.started_at).label('day')
    # Use UTC consistently — started_at is stored as naive UTC.
    cutoff = utcnow_aware().date() - timedelta(days=365)
    cutoff_dt = datetime.combine(cutoff, datetime.min.time(), tzinfo=UTC)
    rows = await db.execute(
        select(day_col)
        .where(ReadingSession.user_id == uid, ReadingSession.started_at >= cutoff_dt)
        .group_by(day_col),
    )
    active = {
        r[0] if isinstance(r[0], date) else date.fromisoformat(r[0])
        for r in rows.all()
    }
    current, _ = compute_streaks(active)
    return current


async def get_annotation_counts(db: AsyncSession, uid: UUID) -> tuple[int, int]:
    """Return (highlights, notes) counts via a single composite query."""
    row = (
        await db.execute(
            select(
                func.count(case((Annotation.type == 'highlight', Annotation.id))).label('highlights'),
                func.count(case((Annotation.type == 'note', Annotation.id))).label('notes'),
            ).where(Annotation.user_id == uid)
        )
    ).one()
    return row.highlights or 0, row.notes or 0


async def get_distinct_tag_count(db: AsyncSession, uid: UUID) -> int:
    """Count distinct tags across all user annotations.

    Uses a PostgreSQL-specific raw query. Falls back to 0 on error
    (e.g., SQLite during tests).
    """
    from sqlalchemy import text

    try:
        result = await db.execute(
            text(
                'SELECT COUNT(DISTINCT t) FROM annotations, unnest(tags) AS t '
                'WHERE user_id = :uid AND tags IS NOT NULL AND array_length(tags, 1) > 0'
            ),
            {'uid': str(uid)},
        )
        return result.scalar() or 0
    except (DBAPIError, ProgrammingError) as exc:
        logger.debug('Tag count query failed (expected on SQLite): %s', exc)
        return 0


async def get_recent_books(db: AsyncSession, uid: UUID, limit: int = 10) -> list[dict]:
    """Last N books sorted by last_read_at."""
    rows = await db.execute(
        select(Book)
        .where(Book.user_id == uid)
        .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
        .limit(limit),
    )
    return [
        {
            'id': str(b.id),
            'title': b.title,
            'author': b.author,
            'progress': float(b.progress or 0),
            'lastRead': (
                b.last_read_at.isoformat()
                if b.last_read_at
                else b.added_at.isoformat() if b.added_at else None
            ),
            'coverUrl': b.cover_url,
        }
        for b in rows.scalars().all()
    ]


async def get_weekly_activity(db: AsyncSession, uid: UUID) -> list[dict]:
    """Pages read per day for the last 7 days (UTC day boundaries)."""
    today = utcnow_aware().date()
    week_start = today - timedelta(days=6)
    # tz-aware UTC midnight — naive datetimes are interpreted in client TZ.
    week_start_dt = datetime.combine(week_start, datetime.min.time(), tzinfo=UTC)
    day_col = func.date(ReadingSession.started_at).label('day')
    rows = await db.execute(
        select(
            day_col,
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
        )
        .where(
            and_(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= week_start_dt,
            ),
        )
        .group_by(day_col)
        .order_by(day_col),
    )
    week_map: dict[str, int] = {}
    for row in rows.all():
        key = row[0].isoformat() if isinstance(row[0], date) else str(row[0])
        week_map[key] = int(row[1])
    return [
        {'day': (week_start + timedelta(days=i)).isoformat(), 'pages': week_map.get((week_start + timedelta(days=i)).isoformat(), 0)}
        for i in range(7)
    ]


async def get_chat_count(db: AsyncSession, uid: UUID) -> int:
    """Total chat messages for user."""
    result = await db.scalar(
        select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid),
    )
    return int(result or 0)


async def get_memory_book_count(db: AsyncSession, uid: UUID) -> int:
    """Total memory books for user."""
    result = await db.scalar(
        select(func.count(MemoryBook.id)).where(MemoryBook.user_id == uid),
    )
    return int(result or 0)
