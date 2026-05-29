"""Reading speed stats — overall and per-book."""

from datetime import date
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.reading_session import ReadingSession


async def get_reading_speed(
    db: AsyncSession,
    uid: UUID,
) -> dict:
    """Return reading speed stats aggregated from sessions."""
    # Overall average pages per hour
    # Only consider sessions with positive duration
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
                ReadingSession.duration > 0,
            )
        )
    )
    avg_pph = avg_pph_row.scalar() or 0
    avg_pph = float(avg_pph)
    avg_wpm = avg_pph * 250.0 / 60.0

    # Speed over time (by day)
    day_col = func.date(ReadingSession.started_at).label('day')
    speed_rows = await db.execute(
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
                ReadingSession.duration > 0,
            )
        )
        .group_by(day_col)
        .order_by(day_col)
    )

    speed_over_time = []
    for row in speed_rows.all():
        day_val = row[0]
        speed_over_time.append({
            'date': day_val.isoformat() if isinstance(day_val, date) else str(day_val),
            'pagesPerHour': round(float(row[1]), 2) if row[1] else 0,
        })

    return {
        'averagePagesPerHour': round(avg_pph, 2),
        'averageWordsPerMinute': round(avg_wpm, 2),
        'currentWpm': round(avg_wpm, 2),
        'speedOverTime': speed_over_time,
    }


async def get_reading_speed_by_book(
    db: AsyncSession,
    uid: UUID,
) -> list[dict]:
    """Return reading speed stats grouped by book."""
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
        .where(ReadingSession.user_id == uid)
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
