"""Tests for app.utils.time helpers.

These helpers exist to avoid a class of bug where SQLAlchemy's asyncpg
dialect binds naive Python datetimes as ``$1::TIMESTAMP WITH TIME ZONE``
and asyncpg interprets naive values using the client process timezone,
silently shifting the bound filter by the local UTC offset.

The fix is to pass tz-aware UTC datetimes. These tests assert that contract.
"""

from datetime import datetime, timezone, timedelta

from app.utils.time import (
    utcnow_aware,
    utc_start_of_day,
    utc_end_of_day,
    utc_start_of_week,
    utc_start_of_month,
)


def test_utcnow_aware_returns_tz_aware_utc():
    """utcnow_aware must return tz-aware UTC — naive values are misinterpreted."""
    now = utcnow_aware()
    assert now.tzinfo is not None, 'must be tz-aware'
    assert now.utcoffset() == timedelta(0), 'must be UTC'


def test_utc_start_of_day_returns_utc_midnight():
    """Today's start must be midnight UTC, not local midnight."""
    start = utc_start_of_day()
    assert start.tzinfo is not None
    assert start.hour == 0
    assert start.minute == 0
    assert start.second == 0
    assert start.utcoffset() == timedelta(0)


def test_utc_start_of_day_explicit_date():
    """Passing an explicit date should respect it."""
    from datetime import date
    start = utc_start_of_day(date(2026, 6, 13))
    assert start.year == 2026
    assert start.month == 6
    assert start.day == 13
    assert start.hour == 0
    assert start.tzinfo is not None


def test_utc_end_of_day_is_next_midnight():
    """End-of-day is exclusive upper bound = next day's midnight UTC."""
    from datetime import date
    end = utc_end_of_day(date(2026, 6, 13))
    assert end.day == 14
    assert end.hour == 0
    assert end.tzinfo is not None


def test_utc_start_of_week_returns_monday():
    """Week start must be Monday for any day in the week."""
    from datetime import date
    # Wednesday June 17, 2026 — week starts Monday June 15
    wed = date(2026, 6, 17)
    start = utc_start_of_week(wed)
    assert start.weekday() == 0, 'must be Monday'
    assert (start.date() - wed).days <= 6
    assert start.tzinfo is not None


def test_utc_start_of_month_returns_first():
    """Month start must be the 1st."""
    from datetime import date
    # Any day in May 2026
    start = utc_start_of_month(date(2026, 5, 15))
    assert start.day == 1
    assert start.month == 5
    assert start.tzinfo is not None


def test_all_helpers_return_aware_datetimes():
    """All public helpers must return tz-aware datetimes (regression guard)."""
    for fn in [utcnow_aware, utc_start_of_day, utc_end_of_day, utc_start_of_week, utc_start_of_month]:
        result = fn()
        assert result.tzinfo is not None, f'{fn.__name__} returned naive datetime'
        assert result.utcoffset() == timedelta(0), f'{fn.__name__} not UTC'
