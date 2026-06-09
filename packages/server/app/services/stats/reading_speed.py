"""Reading speed stats — overall and per-book."""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.reading_session import ReadingSession

logger = logging.getLogger(__name__)

# Minimum session duration (seconds) for speed calculation
# Sessions shorter than this produce unreliable speed estimates
_MIN_DURATION_SECS = 30


def _format_speed_over_time(
    speed_rows: list[tuple],
) -> list[dict]:
    """Convert raw speed-by-day rows into response dicts."""
    result: list[dict] = []
    for row in speed_rows:
        day_val = row[0]
        result.append({
            'date': day_val.isoformat() if isinstance(day_val, date) else str(day_val),
            'pagesPerHour': round(float(row[1]), 2) if row[1] else 0,
        })
    return result


async def _query_daily_speed(
    db: AsyncSession,
    uid: UUID,
) -> list[tuple]:
    """Query average reading speed grouped by day."""
    try:
        day_col = func.date(ReadingSession.started_at).label('day')
        result = await db.execute(
            select(
                day_col,
                func.avg(
                    ReadingSession.pages_read
                    * 3600.0
                    / func.nullif(ReadingSession.duration, 0)
                ).label('pph'),
            )
            .where(
                and_(
                    ReadingSession.user_id == uid,
                    ReadingSession.duration >= _MIN_DURATION_SECS,
                )
            )
            .group_by(day_col)
            .order_by(day_col)
        )
        return result.all()
    except Exception:
        logger.error('Failed to query daily reading speed for user %s', uid, exc_info=True)
        return []


async def get_reading_speed(
    db: AsyncSession,
    uid: UUID,
) -> dict:
    """Return reading speed stats aggregated from sessions."""
    try:
        # Overall average pages per hour
        # Only consider sessions with meaningful duration
        avg_pph_row = await db.execute(
            select(
                func.avg(
                    ReadingSession.pages_read
                    * 3600.0
                    / func.nullif(ReadingSession.duration, 0)
                )
            ).where(
                and_(
                    ReadingSession.user_id == uid,
                    ReadingSession.duration >= _MIN_DURATION_SECS,
                )
            )
        )
        avg_pph = float(avg_pph_row.scalar() or 0)
        avg_wpm = avg_pph * 250.0 / 60.0

        speed_rows = await _query_daily_speed(db, uid)
        speed_over_time = _format_speed_over_time(speed_rows)

        return {
            'averagePagesPerHour': round(avg_pph, 2),
            'averageWordsPerMinute': round(avg_wpm, 2),
            'currentWpm': round(avg_wpm, 2),
            'speedOverTime': speed_over_time,
        }
    except Exception:
        logger.error('Failed to get reading speed for user %s', uid, exc_info=True)
        return {
            'averagePagesPerHour': 0,
            'totalSessions': 0,
            'totalPagesRead': 0,
            'totalMinutes': 0,
            'wpm': 0,
            'daily': [],
        }


async def get_reading_speed_by_book(
    db: AsyncSession,
    uid: UUID,
) -> list[dict]:
    """Return reading speed stats grouped by book."""
    try:
        rows = await db.execute(
            select(
                ReadingSession.book_id,
                Book.title.label('book_title'),
                Book.author.label('book_author'),
                func.count(ReadingSession.id).label('total_sessions'),
                func.coalesce(func.sum(ReadingSession.pages_read), 0).label(
                    'total_pages'
                ),
                func.coalesce(func.sum(ReadingSession.duration), 0).label(
                    'total_seconds'
                ),
                func.avg(
                    ReadingSession.pages_read
                    * 3600.0
                    / func.nullif(ReadingSession.duration, 0)
                ).label('avg_pph'),
            )
            .join(Book, Book.id == ReadingSession.book_id)
            .where(
                and_(
                    ReadingSession.user_id == uid,
                    ReadingSession.duration >= _MIN_DURATION_SECS,
                )
            )
            .group_by(ReadingSession.book_id, Book.title, Book.author)
        )

        books = []
        for row in rows.all():
            total_seconds = int(row[5])
            total_minutes = total_seconds // 60
            avg_pph = float(row[6]) if row[6] else 0
            wpm = round(avg_pph * 250.0 / 60.0, 2)
            books.append({
                'bookId': str(row[0]),
                'bookTitle': row[1],
                'title': row[1],
                'author': row[2],
                'averagePagesPerHour': round(avg_pph, 2),
                'totalSessions': int(row[3]),
                'totalPagesRead': int(row[4]),
                'totalMinutes': total_minutes,
                'wpm': wpm,
            })

        return books
    except Exception:
        logger.error('Failed to get reading speed by book for user %s', uid, exc_info=True)
        return []
