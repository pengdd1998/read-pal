"""Statistics routes — dashboard, calendar, reading speed."""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession

router = APIRouter(prefix='/api/v1/stats', tags=['stats'])


def _user_id(current_user: dict) -> UUID:
    """Extract UUID from the current_user dict."""
    return UUID(current_user['id'])


@router.get('/dashboard')
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return real dashboard stats from database."""
    uid = _user_id(current_user)

    # --- Book counts ---
    total_books = await db.scalar(
        select(func.count(Book.id)).where(Book.user_id == uid)
    )
    books_reading = await db.scalar(
        select(func.count(Book.id)).where(
            and_(Book.user_id == uid, Book.status == BookStatus.reading.value)
        )
    )
    books_completed = await db.scalar(
        select(func.count(Book.id)).where(
            and_(Book.user_id == uid, Book.status == BookStatus.completed.value)
        )
    )

    # --- Pages read ---
    total_pages = await db.scalar(
        select(func.coalesce(func.sum(Book.current_page), 0)).where(
            Book.user_id == uid
        )
    )

    # --- Reading time (seconds -> minutes) ---
    total_seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            ReadingSession.user_id == uid
        )
    )
    total_minutes = int(total_seconds) // 60 if total_seconds else 0

    # --- Streaks ---
    # Query all distinct dates on which the user had reading sessions
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
    longest_streak = 0

    if reading_dates:
        # Current streak: count backwards from today
        today = date.today()
        check = today
        for d in reading_dates:
            if d == check:
                current_streak += 1
                check -= timedelta(days=1)
            elif d < check:
                break

        # Longest streak: iterate all dates in order
        sorted_dates = sorted(reading_dates)
        run = 1
        longest_streak = 1
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] == sorted_dates[i - 1] + timedelta(days=1):
                run += 1
                longest_streak = max(longest_streak, run)
            else:
                run = 1

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

    # --- Flashcards ---
    total_flashcards = await db.scalar(
        select(func.count(Flashcard.id)).where(Flashcard.user_id == uid)
    )

    return {
        'success': True,
        'data': {
            'totalBooks': total_books or 0,
            'booksReading': books_reading or 0,
            'booksCompleted': books_completed or 0,
            'totalPagesRead': int(total_pages or 0),
            'totalReadingTimeMinutes': total_minutes,
            'currentStreak': current_streak,
            'longestStreak': longest_streak,
            'totalHighlights': total_highlights or 0,
            'totalNotes': total_notes or 0,
            'totalFlashcards': total_flashcards or 0,
        },
    }


@router.get('/reading-calendar')
async def get_reading_calendar(
    year: int = Query(2026),
    month: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return calendar data: days with reading activity."""
    uid = _user_id(current_user)

    # Build date filter using date range (cross-DB compatible)
    conditions = [ReadingSession.user_id == uid]
    if month is not None:
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
    else:
        start = datetime(year, 1, 1)
        end = datetime(year + 1, 1, 1)
    conditions.extend([
        ReadingSession.started_at >= start,
        ReadingSession.started_at < end,
    ])

    day_col = func.date(ReadingSession.started_at).label('day')
    rows = await db.execute(
        select(
            day_col,
            func.coalesce(func.sum(ReadingSession.duration), 0).label('seconds'),
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
            func.count(ReadingSession.id).label('sessions'),
        )
        .where(and_(*conditions))
        .group_by(day_col)
        .order_by(day_col)
    )

    days: dict[str, dict] = {}
    for row in rows.all():
        day_val = row[0]
        key = day_val.isoformat() if isinstance(day_val, date) else str(day_val)
        days[key] = {
            'minutes': int(row[1]) // 60,
            'pagesRead': int(row[2]),
            'sessions': int(row[3]),
        }

    return {
        'success': True,
        'data': {
            'days': days,
            'year': year,
            'month': month,
        },
    }


@router.get('/reading-speed')
async def get_reading_speed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats aggregated from sessions."""
    uid = _user_id(current_user)

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
        'success': True,
        'data': {
            'averagePagesPerHour': round(avg_pph, 2),
            'averageWordsPerMinute': round(avg_wpm, 2),
            'speedOverTime': speed_over_time,
        },
    }


@router.get('/reading-speed/by-book')
async def get_reading_speed_by_book(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats grouped by book."""
    uid = _user_id(current_user)

    rows = await db.execute(
        select(
            ReadingSession.book_id,
            Book.title.label('book_title'),
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
        .group_by(ReadingSession.book_id, Book.title)
    )

    books = []
    for row in rows.all():
        total_seconds = int(row[4])
        total_minutes = total_seconds // 60
        books.append({
            'bookId': str(row[0]),
            'bookTitle': row[1],
            'averagePagesPerHour': round(float(row[5]), 2) if row[5] else 0,
            'totalSessions': int(row[2]),
            'totalPagesRead': int(row[3]),
            'totalMinutes': total_minutes,
        })

    return {
        'success': True,
        'data': books,
    }
