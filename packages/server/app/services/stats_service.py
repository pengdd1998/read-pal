"""Statistics business logic — dashboard, calendar, reading speed."""

from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession


async def get_dashboard_stats(
    db: AsyncSession,
    uid: UUID,
) -> dict:
    """Return dashboard data matching the nested shape the frontend expects.

    Response shape: ``{stats, recentBooks, weeklyActivity, booksByStatus}``
    """
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
    books_unread = await db.scalar(
        select(func.count(Book.id)).where(
            and_(Book.user_id == uid, Book.status == BookStatus.unread.value)
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
            'lastRead': book.last_read_at.isoformat() if book.last_read_at else book.added_at.isoformat(),
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

    stats = {
        'booksRead': books_completed or 0,
        'totalPages': int(total_pages or 0),
        'pagesRead': int(total_pages or 0),
        'readingStreak': current_streak,
        'totalTime': total_time_str,
        'conceptsLearned': (total_highlights or 0) + (total_notes or 0),
        'connections': 0,
    }

    # --- Books by status ---
    books_by_status = {
        'unread': books_unread or 0,
        'reading': books_reading or 0,
        'completed': books_completed or 0,
    }

    return {
        'stats': stats,
        'recentBooks': recent_books,
        'weeklyActivity': weekly_activity,
        'booksByStatus': books_by_status,
    }


async def get_reading_calendar(
    db: AsyncSession,
    uid: UUID,
    months: int | None,
    year: int | None,
    month: int | None,
) -> dict:
    """Return calendar data: days with reading activity.

    Supports two modes:
    - ``?months=6`` — last N months from today (frontend StreakCalendar)
    - ``?year=2026`` and optional ``?month=4`` — specific date range
    """
    # Build date filter using date range (cross-DB compatible)
    conditions = [ReadingSession.user_id == uid]
    if months is not None:
        # Last N months from today
        today = date.today()
        end = datetime.combine(today + timedelta(days=1), datetime.min.time())
        start = datetime(today.year, today.month - min(months, 12), 1) if today.month > min(months, 12) else datetime(today.year - 1, 12 + today.month - months, 1)
    elif month is not None and year is not None:
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
    else:
        y = year or date.today().year
        start = datetime(y, 1, 1)
        end = datetime(y + 1, 1, 1)
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

    # Build calendar array matching frontend StreakCalendar shape
    calendar = [
        {'date': d, 'pages': v['pagesRead'], 'minutes': v['minutes']}
        for d, v in sorted(days.items())
    ]

    # Compute streaks
    sorted_dates = sorted(days.keys())
    current_streak = 0
    longest_streak = 0
    if sorted_dates:
        streak = 1
        longest_streak = 1
        today = date.today()
        # Check current streak from today backward
        d = today
        while True:
            key = d.isoformat()
            if key in days:
                current_streak += 1
                d -= timedelta(days=1)
            else:
                break
        # Longest streak
        for i in range(1, len(sorted_dates)):
            prev = date.fromisoformat(sorted_dates[i - 1])
            curr = date.fromisoformat(sorted_dates[i])
            if (curr - prev).days == 1:
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1

    return {
        'calendar': calendar,
        'currentStreak': current_streak,
        'longestStreak': longest_streak,
        'totalDaysActive': len(days),
        'year': year,
        'month': month,
    }


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
