"""Reading calendar and weekly summary stats."""

from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.reading_session import ReadingSession
from app.services.stats.streaks import compute_streaks


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
        start = (
            datetime(today.year, today.month - min(months, 12), 1)
            if today.month > min(months, 12)
            else datetime(today.year - 1, 12 + today.month - months, 1)
        )
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

    # Compute streaks via shared utility
    active_dates = {date.fromisoformat(d) for d in days}
    current_streak, longest_streak = compute_streaks(active_dates)

    return {
        'calendar': calendar,
        'currentStreak': current_streak,
        'longestStreak': longest_streak,
        'totalDaysActive': len(days),
        'year': year,
        'month': month,
    }


async def get_weekly_summary(db: AsyncSession, uid: UUID) -> dict:
    """Return weekly reading summary (Mon-Sun of the current week)."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    dt_start = datetime.combine(week_start, datetime.min.time())
    dt_end = datetime.combine(week_end + timedelta(days=1), datetime.min.time())

    # Aggregate sessions for the week
    day_col = func.date(ReadingSession.started_at).label('day')
    sess_rows = await db.execute(
        select(
            day_col,
            func.coalesce(func.sum(ReadingSession.duration), 0).label('seconds'),
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
        )
        .where(and_(
            ReadingSession.user_id == uid,
            ReadingSession.started_at >= dt_start,
            ReadingSession.started_at < dt_end,
        ))
        .group_by(day_col)
    )
    daily_map: dict[str, dict] = {}
    for row in sess_rows.all():
        key = row[0].isoformat() if isinstance(row[0], date) else str(row[0])
        daily_map[key] = {'minutes': int(row[1]) // 60, 'pages': int(row[2])}

    # Annotations counts for the week
    hl_count = await db.scalar(
        select(func.count(Annotation.id)).where(and_(
            Annotation.user_id == uid, Annotation.type == 'highlight',
            Annotation.created_at >= dt_start, Annotation.created_at < dt_end,
        ))
    )
    note_count = await db.scalar(
        select(func.count(Annotation.id)).where(and_(
            Annotation.user_id == uid, Annotation.type == 'note',
            Annotation.created_at >= dt_start, Annotation.created_at < dt_end,
        ))
    )

    # Active books this week
    active_books = await db.scalar(
        select(func.count(func.distinct(ReadingSession.book_id))).where(and_(
            ReadingSession.user_id == uid,
            ReadingSession.started_at >= dt_start,
            ReadingSession.started_at < dt_end,
        ))
    )

    # Streaks (reuse calendar logic)
    cal = await get_reading_calendar(db, uid, months=1, year=None, month=None)
    current_streak = cal['currentStreak']
    longest_streak = cal['longestStreak']

    # Build daily breakdown
    daily_breakdown = []
    total_minutes, total_pages, streak_days = 0, 0, 0
    for i in range(7):
        d = (week_start + timedelta(days=i)).isoformat()
        entry = daily_map.get(d, {'minutes': 0, 'pages': 0})
        total_minutes += entry['minutes']
        total_pages += entry['pages']
        if d in daily_map:
            streak_days += 1
        daily_breakdown.append({'date': d, 'minutes': entry['minutes'], 'pages': entry['pages']})

    return {
        'weekStart': week_start.isoformat(),
        'weekEnd': week_end.isoformat(),
        'minutesRead': total_minutes,
        'pagesRead': total_pages,
        'highlightsCount': hl_count or 0,
        'notesCount': note_count or 0,
        'booksActive': active_books or 0,
        'streakDays': streak_days,
        'currentStreak': current_streak,
        'longestStreak': longest_streak,
        'dailyBreakdown': daily_breakdown,
    }
