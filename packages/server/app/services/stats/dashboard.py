"""Dashboard stats with Redis caching."""

import asyncio
import json
import logging
from datetime import date, datetime, timedelta
from uuid import UUID

import redis.exceptions
from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis
from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.chat_message import ChatMessage
from app.models.memory_book import MemoryBook
from app.models.reading_session import ReadingSession
from app.services.stats.streaks import compute_streaks
logger = logging.getLogger(__name__)

_DASHBOARD_CACHE_TTL = None  # lazy-init from settings


def _get_cache_ttl() -> int:
    global _DASHBOARD_CACHE_TTL
    if _DASHBOARD_CACHE_TTL is None:
        _DASHBOARD_CACHE_TTL = get_settings().cache_data_ttl_seconds
    return _DASHBOARD_CACHE_TTL


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
    except redis.exceptions.RedisError as exc:
        logger.warning('Failed to invalidate dashboard cache for user %s: %s', uid, exc)


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
    # Use 365-day window for streaks to avoid capping long streaks
    cutoff = date.today() - timedelta(days=365)
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


async def _get_distinct_tag_count(db: AsyncSession, uid: UUID) -> int:
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
# Assembly helpers
# ---------------------------------------------------------------------------


def _safe_default(exc: Exception, fallback: object = 0) -> object:
    """Log a partial-dashboard failure and return a safe default."""
    logger.warning('Dashboard partial query failed: %s', str(exc)[:200])
    return fallback


async def _gather_raw_data(db: AsyncSession, uid: UUID) -> dict:
    """Collect all raw data from DB helpers and direct queries in parallel.

    Uses return_exceptions=True so a single query failure doesn't break
    the entire dashboard — failed sections fall back to safe defaults.
    """
    results = await asyncio.gather(
        _get_book_status_counts(db, uid),
        _get_pages_read(db, uid),
        _get_reading_minutes(db, uid),
        _compute_streak(db, uid),
        _get_annotation_counts(db, uid),
        _get_recent_books(db, uid),
        _get_weekly_activity(db, uid),
        db.scalar(select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid)),
        db.scalar(select(func.count(MemoryBook.id)).where(MemoryBook.user_id == uid)),
        _get_distinct_tag_count(db, uid),
        return_exceptions=True,
    )

    def _val(idx: int, default: object = 0) -> object:
        r = results[idx]
        return _safe_default(r) if isinstance(r, Exception) else r

    status_counts = _val(0, {'total': 0, 'reading': 0, 'completed': 0, 'unread': 0})
    pages_read = int(_val(1))
    total_minutes = int(_val(2))
    streak = int(_val(3))
    annotation_pair = _val(4, (0, 0))
    highlights, notes = annotation_pair if isinstance(annotation_pair, tuple) else (0, 0)
    recent_books = _val(5, [])
    weekly_activity = _val(6, [])
    chat_count = int(_val(7) or 0)
    memory_count = int(_val(8) or 0)
    distinct_tags = int(_val(9))

    return {
        'status_counts': status_counts,
        'pages_read': pages_read,
        'total_minutes': total_minutes,
        'streak': streak,
        'highlights': highlights,
        'notes': notes,
        'recent_books': recent_books,
        'weekly_activity': weekly_activity,
        'chat_count': chat_count,
        'memory_count': memory_count,
        'distinct_tags': distinct_tags,
    }


def _build_response(raw: dict) -> dict:
    """Assemble the nested response dict the frontend expects."""
    sc = raw['status_counts']
    stats = {
        'booksRead': sc['completed'],
        'totalPages': raw['pages_read'],
        'pagesRead': raw['pages_read'],
        'readingStreak': raw['streak'],
        'totalTime': _format_time(raw['total_minutes']),
        'conceptsLearned': raw['highlights'] + raw['notes'],
        'connections': raw['distinct_tags'],
        'chatMessageCount': raw['chat_count'],
        'memoryBookCount': raw['memory_count'],
    }
    return {
        'stats': stats,
        'recentBooks': raw['recent_books'],
        'weeklyActivity': raw['weekly_activity'],
        'booksByStatus': {
            'unread': sc['unread'],
            'reading': sc['reading'],
            'completed': sc['completed'],
        },
    }


async def _read_dashboard_cache(uid: UUID) -> dict | None:
    """Return cached dashboard data or None on miss/failure."""
    try:
        redis = get_redis()
        cached = await redis.get(_dashboard_cache_key(uid))
        if cached is not None:
            return json.loads(cached)
    except redis.exceptions.RedisError as exc:
        logger.warning('Redis read failed for dashboard cache: %s', exc)
    return None


async def _write_dashboard_cache(uid: UUID, data: dict) -> None:
    """Store dashboard data in Redis cache."""
    try:
        redis = get_redis()
        await redis.set(
            _dashboard_cache_key(uid), json.dumps(data), ex=_get_cache_ttl(),
        )
    except redis.exceptions.RedisError as exc:
        logger.warning('Failed to cache dashboard stats for user %s: %s', uid, exc)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def get_dashboard_stats(db: AsyncSession, uid: UUID) -> dict:
    """Return dashboard data matching the nested shape the frontend expects.

    Response shape: ``{stats, recentBooks, weeklyActivity, booksByStatus}``

    Results are cached in Redis. Use ``invalidate_dashboard_cache``
    to force a refresh when underlying data changes.
    """
    cached = await _read_dashboard_cache(uid)
    if cached is not None:
        return cached

    raw = await _gather_raw_data(db, uid)
    result = _build_response(raw)
    await _write_dashboard_cache(uid, result)
    return result
