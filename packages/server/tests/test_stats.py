"""Tests for stats endpoints — dashboard, calendar, reading speed."""

import pytest

from tests.conftest import auth_headers, register_user


# ---------------------------------------------------------------------------
# GET /api/v1/stats/dashboard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_returns_success_with_all_fields(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/stats/dashboard', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True

    data = body['data']
    # New nested shape: {stats, recentBooks, weeklyActivity, booksByStatus}
    assert 'stats' in data
    assert 'recentBooks' in data
    assert 'weeklyActivity' in data
    assert 'booksByStatus' in data
    assert isinstance(data['recentBooks'], list)
    assert isinstance(data['weeklyActivity'], list)
    assert isinstance(data['booksByStatus'], dict)


# ---------------------------------------------------------------------------
# GET /api/v1/stats/reading-calendar
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reading_calendar_returns_success_with_year_month(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/stats/reading-calendar?year=2026',
        headers=headers,
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True

    data = body['data']
    assert data['year'] == 2026
    assert data['month'] is None
    assert 'calendar' in data
    assert 'currentStreak' in data
    assert 'longestStreak' in data


@pytest.mark.asyncio
async def test_reading_calendar_with_month_filter(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get(
        '/api/v1/stats/reading-calendar?year=2026&month=4',
        headers=headers,
    )
    assert resp.status_code == 200

    data = resp.json()['data']
    assert data['year'] == 2026
    assert data['month'] == 4


# ---------------------------------------------------------------------------
# GET /api/v1/stats/reading-speed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reading_speed_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/stats/reading-speed', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True

    data = body['data']
    assert 'averagePagesPerHour' in data
    assert 'averageWordsPerMinute' in data
    assert 'speedOverTime' in data


# ---------------------------------------------------------------------------
# GET /api/v1/stats/reading-speed/by-book
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reading_speed_by_book_returns_success(client):
    reg = await register_user(client)
    headers = auth_headers(reg['token'])

    resp = await client.get('/api/v1/stats/reading-speed/by-book', headers=headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body['success'] is True
    assert isinstance(body['data'], list)


# ---------------------------------------------------------------------------
# Auth guard — all endpoints require a valid token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_returns_401_without_auth(client):
    resp = await client.get('/api/v1/stats/dashboard')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reading_calendar_returns_401_without_auth(client):
    resp = await client.get('/api/v1/stats/reading-calendar')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reading_speed_returns_401_without_auth(client):
    resp = await client.get('/api/v1/stats/reading-speed')
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reading_speed_by_book_returns_401_without_auth(client):
    resp = await client.get('/api/v1/stats/reading-speed/by-book')
    assert resp.status_code == 401


class TestBuildDateRangeMonthRollback:
    """Regression: today.replace(month=...) crashed with
    'day is out of range for month' when the N-month rollback landed on a
    shorter month (e.g. Aug 29 → Feb 29 in a non-leap year)."""

    def test_aug29_months6_reaches_feb1(self):
        # Aug 29 − 6 months lands on the nonexistent Feb 29 — the rollback
        # must reach Feb 1 without raising. The fake clock is REQUIRED:
        # unpatched, the assertion is date-dependent and broke the moment
        # the calendar rolled past August (CI failed on Sep 1 UTC).
        from unittest.mock import patch
        import datetime as dt
        from app.services.stats.calendar import _build_date_range
        from app.services.stats import calendar as cal

        fake_now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.UTC)
        with patch.object(cal, 'utcnow_aware', return_value=fake_now):
            start, _ = _build_date_range(6, None, None)
        assert (start.year, start.month, start.day) == (2026, 2, 1)

    def test_may31_months3_rolls_to_feb1(self):
        """May 31 − 3 months crosses a 29/30-day month — must not raise."""
        from unittest.mock import patch
        import datetime as dt
        from app.services.stats.calendar import _build_date_range
        from app.services.stats import calendar as cal

        fake_now = dt.datetime(2026, 5, 31, 12, 0, tzinfo=dt.timezone.utc)
        with patch.object(cal, 'utcnow_aware', return_value=fake_now):
            start, _ = _build_date_range(3, None, None)
        assert (start.year, start.month, start.day) == (2026, 2, 1)

    def test_may31_months1_rolls_to_apr1(self):
        from unittest.mock import patch
        import datetime as dt
        from app.services.stats.calendar import _build_date_range
        from app.services.stats import calendar as cal

        fake_now = dt.datetime(2026, 5, 31, 12, 0, tzinfo=dt.timezone.utc)
        with patch.object(cal, 'utcnow_aware', return_value=fake_now):
            start, _ = _build_date_range(1, None, None)
        assert (start.year, start.month, start.day) == (2026, 4, 1)
