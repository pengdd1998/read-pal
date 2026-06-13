"""Time helpers for UTC-correct date filtering.

SQLAlchemy's asyncpg dialect renders naive Python datetimes against
``DateTime(timezone=True)`` columns as ``$1::TIMESTAMP WITH TIME ZONE``.
asyncpg then interprets a *naive* datetime using the client process TZ
(e.g. CST/UTC+8 on macOS dev), shifting the bound value by the offset.

Result: a query like ``Model.started_at >= datetime.combine(utcnow().date(), min.time())``
silently includes sessions from late in the previous UTC day.

Fix: pass timezone-aware UTC datetimes everywhere we filter. The helpers
below construct such bounds from UTC date components so callers cannot
accidentally mix local date with UTC timestamps.
"""

from datetime import date, datetime, time, timedelta, timezone


def utcnow_aware() -> datetime:
    """Return tz-aware UTC now (preferred over naive ``utcnow()`` for filters)."""
    return datetime.now(timezone.utc)


def utc_start_of_day(day: date | None = None) -> datetime:
    """Return tz-aware UTC midnight for the given day (default: today UTC)."""
    day = day or utcnow_aware().date()
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def utc_end_of_day(day: date | None = None) -> datetime:
    """Return tz-aware UTC midnight of the next day (exclusive upper bound)."""
    day = day or utcnow_aware().date()
    return datetime.combine(day + timedelta(days=1), time.min, tzinfo=timezone.utc)


def utc_start_of_week(day: date | None = None) -> datetime:
    """Return tz-aware UTC midnight of Monday for the week containing *day*.

    Week starts on Monday (``weekday() == 0``).
    """
    day = day or utcnow_aware().date()
    monday = day - timedelta(days=day.weekday())
    return datetime.combine(monday, time.min, tzinfo=timezone.utc)


def utc_start_of_month(day: date | None = None) -> datetime:
    """Return tz-aware UTC midnight of the 1st for the month containing *day*."""
    day = day or utcnow_aware().date()
    return datetime.combine(day.replace(day=1), time.min, tzinfo=timezone.utc)
