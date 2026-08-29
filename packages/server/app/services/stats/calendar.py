"""Reading calendar and weekly summary stats."""

from datetime import date, datetime, timedelta, UTC
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.reading_session import ReadingSession
import logging

from app.services.stats.streaks import compute_streaks
from app.services.stats import STATS_LOOKBACK_DELTA
from app.utils.db import db_error_guard
from app.utils.time import utcnow_aware

logger = logging.getLogger('read-pal.stats.calendar')


def _build_date_range(
    months: int | None,
    year: int | None,
    month: int | None,
) -> tuple[datetime, datetime]:
    """Compute (start, end) datetime range for calendar queries.

    Returns tz-aware UTC datetimes — required for correct filtering because
    SQLAlchemy binds naive datetimes against DateTime(timezone=True) columns
    as ``$1::TIMESTAMP WITH TIME ZONE``, and asyncpg interprets naive values
    using the client process TZ.
    """
    if months is not None:
        today = utcnow_aware().date()
        end = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        m = min(months, 12)
        # Roll back m months from the FIRST of the current month. Naive
        # ``today.replace(month=...)`` crashed with "day is out of range
        # for month" whenever the rollback landed on a shorter month that
        # has no today.day (e.g. Aug 29 → Feb 29 in a non-leap year).
        first_of_month = today.replace(day=1)
        total = first_of_month.year * 12 + (first_of_month.month - 1) - m
        start_date = date(total // 12, total % 12 + 1, 1)
        start = datetime(start_date.year, start_date.month, 1, tzinfo=UTC)
    elif month is not None and year is not None:
        start = datetime(year, month, 1, tzinfo=UTC)
        end = (
            datetime(year + 1, 1, 1, tzinfo=UTC)
            if month == 12
            else datetime(year, month + 1, 1, tzinfo=UTC)
        )
    else:
        y = year or utcnow_aware().date().year
        start, end = (
            datetime(y, 1, 1, tzinfo=UTC),
            datetime(y + 1, 1, 1, tzinfo=UTC),
        )
    return start, end


def _parse_day_rows(rows: list[tuple]) -> dict[str, dict]:
    """Convert aggregated session rows to a {date_str: {minutes, pages}} map."""
    result: dict[str, dict] = {}
    for row in rows:
        day_val = row[0]
        key = day_val.isoformat() if isinstance(day_val, date) else str(day_val)
        result[key] = {'minutes': int(row[1]) // 60, 'pages': int(row[2])}
    return result


async def _aggregate_sessions(
    db: AsyncSession,
    uid: UUID,
    dt_start: datetime,
    dt_end: datetime,
) -> dict[str, dict]:
    """Aggregate reading sessions by day within a date range."""
    day_col = func.date(ReadingSession.started_at).label('day')
    async with db_error_guard('calendar._aggregate_sessions'):
        rows = await db.execute(
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
            .group_by(day_col),
        )
        return _parse_day_rows(rows.all())


async def _count_annotations(
    db: AsyncSession,
    uid: UUID,
    dt_start: datetime,
    dt_end: datetime,
) -> tuple[int, int]:
    """Count highlights and notes created within a date range."""
    async with db_error_guard('calendar._count_annotations'):
        row = (
            await db.execute(
                select(
                    func.count(case((Annotation.type == 'highlight', Annotation.id))).label('highlights'),
                    func.count(case((Annotation.type == 'note', Annotation.id))).label('notes'),
                ).where(and_(
                    Annotation.user_id == uid,
                    Annotation.created_at >= dt_start,
                    Annotation.created_at < dt_end,
                ))
            )
        ).one()
        return row.highlights or 0, row.notes or 0


async def _get_streak_data(
    db: AsyncSession,
    uid: UUID,
    cutoff: date,
) -> tuple[int, int]:
    """Compute current and longest streaks from a cutoff date."""
    day_col = func.date(ReadingSession.started_at).label('day')
    cutoff_dt = datetime.combine(cutoff, datetime.min.time(), tzinfo=UTC)
    async with db_error_guard('calendar._get_streak_data'):
        rows = await db.execute(
            select(day_col).where(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= cutoff_dt,
            ).group_by(day_col),
        )
        active_dates = {
            r[0] if isinstance(r[0], date) else date.fromisoformat(r[0])
            for r in rows.all()
        }
        return compute_streaks(active_dates)


async def _query_calendar_days(
    db: AsyncSession,
    uid: UUID,
    dt_start: datetime,
    dt_end: datetime,
) -> dict[str, dict]:
    """Aggregate reading sessions by day, returning {date_str: {minutes, pagesRead, sessions}}."""
    day_col = func.date(ReadingSession.started_at).label('day')
    async with db_error_guard('calendar._query_calendar_days'):
        rows = await db.execute(
            select(
                day_col,
                func.coalesce(func.sum(ReadingSession.duration), 0).label('seconds'),
                func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
                func.count(ReadingSession.id).label('sessions'),
            )
            .where(and_(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= dt_start,
                ReadingSession.started_at < dt_end,
            ))
            .group_by(day_col)
            .order_by(day_col),
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
        return days


def _build_calendar_response(
    days: dict[str, dict],
    year: int | None,
    month: int | None,
) -> dict:
    """Build the final calendar response dict with streaks and summary."""
    calendar = [
        {'date': d, 'pages': v['pagesRead'], 'minutes': v['minutes']}
        for d, v in sorted(days.items())
    ]
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


async def get_reading_calendar(
    db: AsyncSession,
    uid: UUID,
    months: int | None,
    year: int | None,
    month: int | None,
) -> dict:
    """Return calendar data: days with reading activity."""
    start, end = _build_date_range(months, year, month)
    days = await _query_calendar_days(db, uid, start, end)
    return _build_calendar_response(days, year, month)


def _build_daily_breakdown(
    week_start: date,
    daily_map: dict[str, dict],
) -> tuple[list[dict], int, int, int]:
    """Build daily breakdown array and compute totals."""
    daily_breakdown: list[dict] = []
    total_minutes, total_pages, streak_days = 0, 0, 0
    for i in range(7):
        d = (week_start + timedelta(days=i)).isoformat()
        entry = daily_map.get(d, {'minutes': 0, 'pages': 0})
        total_minutes += entry['minutes']
        total_pages += entry['pages']
        if d in daily_map:
            streak_days += 1
        daily_breakdown.append({'date': d, 'minutes': entry['minutes'], 'pages': entry['pages']})
    return daily_breakdown, total_minutes, total_pages, streak_days


async def get_weekly_summary(db: AsyncSession, uid: UUID) -> dict:
    """Return weekly reading summary (Mon-Sun of the current UTC week)."""
    today = utcnow_aware().date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    # tz-aware UTC bounds — see _build_date_range for why.
    dt_start = datetime.combine(week_start, datetime.min.time(), tzinfo=UTC)
    dt_end = datetime.combine(
        week_end + timedelta(days=1), datetime.min.time(), tzinfo=UTC,
    )

    # Run queries SEQUENTIALLY — AsyncSession is a single-connection proxy
    # and is not safe for concurrent use. The prior asyncio.gather over
    # four session calls could interleave BEGIN/COMMIT/FETCH on the same
    # connection and produce "this session is already executing" errors
    # or, worse, corrupt result rows. See SQLAlchemy AsyncSession docs.
    daily_map = await _aggregate_sessions(db, uid, dt_start, dt_end)
    hl_count, note_count = await _count_annotations(db, uid, dt_start, dt_end)
    active_books = await db.scalar(
        select(func.count(func.distinct(ReadingSession.book_id))).where(and_(
            ReadingSession.user_id == uid,
            ReadingSession.started_at >= dt_start,
            ReadingSession.started_at < dt_end,
        ))
    )
    current_streak, longest_streak = await _get_streak_data(
        db, uid, today - STATS_LOOKBACK_DELTA,
    )

    daily_breakdown, total_minutes, total_pages, streak_days = _build_daily_breakdown(
        week_start, daily_map,
    )

    return {
        'weekStart': week_start.isoformat(),
        'weekEnd': week_end.isoformat(),
        'minutesRead': total_minutes,
        'pagesRead': total_pages,
        'highlightsCount': hl_count,
        'notesCount': note_count,
        'booksActive': active_books or 0,
        'streakDays': streak_days,
        'currentStreak': current_streak,
        'longestStreak': longest_streak,
        'dailyBreakdown': daily_breakdown,
    }
