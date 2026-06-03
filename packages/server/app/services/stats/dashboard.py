"""Dashboard stats with Redis caching."""

import asyncio
import json
import logging
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.chat_message import ChatMessage
from app.models.memory_book import MemoryBook
from app.models.reading_session import ReadingSession
from app.services.stats.streaks import compute_streaks

logger = logging.getLogger(__name__)

_DASHBOARD_CACHE_TTL = 300  # 5 minutes


def _dashboard_cache_key(uid: UUID) -> str:
    """Return the Redis cache key for a user's dashboard stats."""
    return f'stats:dashboard:{uid}'


async def invalidate_dashboard_cache(uid: UUID) -> None:
    """Delete the cached dashboard stats for a user.

    Call this when reading sessions end or annotations are created/updated
    so the next dashboard request returns fresh data.
    """
    try:
        redis = get_redis()
        await redis.delete(_dashboard_cache_key(uid))
    except Exception:
        logger.warning('Failed to invalidate dashboard cache for user %s', uid)


# ---------------------------------------------------------------------------
# Helper functions (decomposed from the original monolith)
# ---------------------------------------------------------------------------


async def _get_book_status_counts(db: AsyncSession, uid: UUID) -> dict[str, int]:
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


async def _get_pages_read(db: AsyncSession, uid: UUID) -> int:
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


async def _get_reading_minutes(db: AsyncSession, uid: UUID) -> int:
    """Total reading time in minutes."""
    seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            ReadingSession.user_id == uid,
        ),
    )
    return int(seconds) // 60 if seconds else 0


async def _compute_streak(db: AsyncSession, uid: UUID) -> int:
    """Current reading streak (consecutive days ending today)."""
    day_col = func.date(ReadingSession.started_at).label('day')
    cutoff = date.today() - timedelta(days=60)
    rows = await db.execute(
        select(day_col)
        .where(ReadingSession.user_id == uid, ReadingSession.started_at >= cutoff)
        .group_by(day_col),
    )
    active = {
        r[0] if isinstance(r[0], date) else date.fromisoformat(r[0])
        for r in rows.all()
    }
    current, _ = compute_streaks(active)
    return current


async def _get_annotation_counts(db: AsyncSession, uid: UUID) -> tuple[int, int]:
    """Return (highlights, notes) counts."""
    highlights = await db.scalar(
        select(func.count(Annotation.id)).where(
            and_(Annotation.user_id == uid, Annotation.type == 'highlight'),
        ),
    )
    notes = await db.scalar(
        select(func.count(Annotation.id)).where(
            and_(Annotation.user_id == uid, Annotation.type == 'note'),
        ),
    )
    return highlights or 0, notes or 0


async def _get_recent_books(db: AsyncSession, uid: UUID, limit: int = 10) -> list[dict]:
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


async def _get_weekly_activity(db: AsyncSession, uid: UUID) -> list[dict]:
    """Pages read per day for the last 7 days."""
    today = date.today()
    week_start = today - timedelta(days=6)
    day_col = func.date(ReadingSession.started_at).label('day')
    rows = await db.execute(
        select(
            day_col,
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
        )
        .where(
            and_(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= datetime.combine(week_start, datetime.min.time()),
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


def _format_time(minutes: int) -> str:
    """Format minutes as 'Xh Ym' or 'Ym'."""
    hours = minutes // 60
    mins = minutes % 60
    return f'{hours}h {mins}m' if hours > 0 else f'{mins}m'


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def get_dashboard_stats(
    db: AsyncSession,
    uid: UUID,
) -> dict:
    """Return dashboard data matching the nested shape the frontend expects.

    Response shape: ``{stats, recentBooks, weeklyActivity, booksByStatus}``

    Results are cached in Redis for 5 minutes. Use ``invalidate_dashboard_cache``
    to force a refresh when underlying data changes.
    """
    # --- Check Redis cache ---
    cache_key = _dashboard_cache_key(uid)
    try:
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached is not None:
            return json.loads(cached)
    except Exception:
        logger.warning('Redis read failed for dashboard cache, querying DB')

    # --- Gather all data via helpers (parallelized) ---
    (
        status_counts,
        pages_read,
        total_minutes,
        streak,
        (highlights, notes),
        recent_books,
        weekly_activity,
    ) = await asyncio.gather(
        _get_book_status_counts(db, uid),
        _get_pages_read(db, uid),
        _get_reading_minutes(db, uid),
        _compute_streak(db, uid),
        _get_annotation_counts(db, uid),
        _get_recent_books(db, uid),
        _get_weekly_activity(db, uid),
    )

    chat_count, memory_count = await asyncio.gather(
        db.scalar(
            select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid),
        ),
        db.scalar(
            select(func.count(MemoryBook.id)).where(MemoryBook.user_id == uid),
        ),
    )

    # --- Assemble response ---
    stats = {
        'booksRead': status_counts['completed'],
        'totalPages': pages_read,
        'pagesRead': pages_read,
        'readingStreak': streak,
        'totalTime': _format_time(total_minutes),
        'conceptsLearned': highlights + notes,
        'connections': 0,
        'chatMessageCount': chat_count or 0,
        'memoryBookCount': memory_count or 0,
    }

    result = {
        'stats': stats,
        'recentBooks': recent_books,
        'weeklyActivity': weekly_activity,
        'booksByStatus': {
            'unread': status_counts['unread'],
            'reading': status_counts['reading'],
            'completed': status_counts['completed'],
        },
    }

    # --- Store in Redis cache ---
    try:
        redis = get_redis()
        await redis.set(cache_key, json.dumps(result), ex=_DASHBOARD_CACHE_TTL)
    except Exception:
        logger.warning('Failed to cache dashboard stats for user %s', uid)

    return result
