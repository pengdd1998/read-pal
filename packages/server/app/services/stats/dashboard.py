"""Dashboard stats with Redis caching."""

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

    # --- Book counts (single GROUP BY query) ---
    status_rows = await db.execute(
        select(Book.status, func.count(Book.id))
        .where(Book.user_id == uid)
        .group_by(Book.status)
    )
    status_counts = {row[0]: row[1] for row in status_rows.all()}
    total_books = sum(status_counts.values())
    books_reading = status_counts.get(BookStatus.reading, 0)
    books_completed = status_counts.get(BookStatus.completed, 0)
    books_unread = status_counts.get(BookStatus.unread, 0)

    # --- Pages read (from reading sessions, fallback to book progress) ---
    total_pages = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.pages_read), 0)).where(
            ReadingSession.user_id == uid
        )
    )
    # Fallback: if no session data, sum book current_page as approximate pages read
    if not total_pages:
        book_pages = await db.scalar(
            select(func.coalesce(func.sum(Book.current_page), 0)).where(
                and_(Book.user_id == uid, Book.current_page > 0)
            )
        )
        total_pages = book_pages or 0

    # --- Reading time (seconds -> minutes) ---
    total_seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            ReadingSession.user_id == uid
        )
    )
    total_minutes = int(total_seconds) // 60 if total_seconds else 0

    # --- Streaks ---
    date_col = func.date(ReadingSession.started_at).label('day')
    date_rows = await db.execute(
        select(date_col)
        .where(ReadingSession.user_id == uid)
        .group_by(date_col)
        .order_by(date_col.desc())
    )
    reading_dates = [
        row[0] if isinstance(row[0], date) else date.fromisoformat(row[0])
        for row in date_rows.all()
    ]

    current_streak = 0

    if reading_dates:
        today = date.today()
        check = today
        for d in reading_dates:
            if d == check:
                current_streak += 1
                check -= timedelta(days=1)
            elif d < check:
                break

    # --- Annotations ---
    total_highlights = await db.scalar(
        select(func.count(Annotation.id)).where(
            and_(Annotation.user_id == uid, Annotation.type == 'highlight')
        )
    )
    total_notes = await db.scalar(
        select(func.count(Annotation.id)).where(
            and_(Annotation.user_id == uid, Annotation.type == 'note')
        )
    )

    # --- Recent books (last 10 by last_read_at desc) ---
    recent_rows = await db.execute(
        select(Book)
        .where(Book.user_id == uid)
        .order_by(Book.last_read_at.desc().nullslast(), Book.added_at.desc())
        .limit(10)
    )
    recent_books = []
    for book in recent_rows.scalars().all():
        recent_books.append({
            'id': str(book.id),
            'title': book.title,
            'author': book.author,
            'progress': float(book.progress or 0),
            'lastRead': (
                book.last_read_at.isoformat()
                if book.last_read_at
                else book.added_at.isoformat() if book.added_at else None
            ),
            'coverUrl': book.cover_url,
        })

    # --- Weekly activity (last 7 days) ---
    today = date.today()
    week_start = today - timedelta(days=6)
    day_col = func.date(ReadingSession.started_at).label('day')
    week_rows = await db.execute(
        select(
            day_col,
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
        )
        .where(
            and_(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= datetime.combine(week_start, datetime.min.time()),
            )
        )
        .group_by(day_col)
        .order_by(day_col)
    )
    week_map: dict[str, int] = {}
    for row in week_rows.all():
        key = row[0].isoformat() if isinstance(row[0], date) else str(row[0])
        week_map[key] = int(row[1])
    weekly_activity = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        weekly_activity.append({
            'day': d.isoformat(),
            'pages': week_map.get(d.isoformat(), 0),
        })

    # --- Stats object ---
    hours = total_minutes // 60
    mins = total_minutes % 60
    total_time_str = f'{hours}h {mins}m' if hours > 0 else f'{mins}m'

    # --- Chat messages & Memory books ---
    chat_message_count = await db.scalar(
        select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid)
    )
    memory_book_count = await db.scalar(
        select(func.count(MemoryBook.id)).where(MemoryBook.user_id == uid)
    )

    stats = {
        'booksRead': books_completed or 0,
        'totalPages': int(total_pages or 0),
        'pagesRead': int(total_pages or 0),
        'readingStreak': current_streak,
        'totalTime': total_time_str,
        'conceptsLearned': (total_highlights or 0) + (total_notes or 0),
        'connections': 0,
        'chatMessageCount': chat_message_count or 0,
        'memoryBookCount': memory_book_count or 0,
    }

    # --- Books by status ---
    books_by_status = {
        'unread': books_unread or 0,
        'reading': books_reading or 0,
        'completed': books_completed or 0,
    }

    result = {
        'stats': stats,
        'recentBooks': recent_books,
        'weeklyActivity': weekly_activity,
        'booksByStatus': books_by_status,
    }

    # --- Store in Redis cache ---
    try:
        redis = get_redis()
        await redis.set(cache_key, json.dumps(result), ex=_DASHBOARD_CACHE_TTL)
    except Exception:
        logger.warning('Failed to cache dashboard stats for user %s', uid)

    return result
