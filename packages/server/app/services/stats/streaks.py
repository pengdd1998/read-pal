"""Shared streak computation for dashboard and calendar."""

from datetime import date, datetime, timedelta, UTC


def compute_streaks(
    active_dates: set[date],
    today: date | None = None,
) -> tuple[int, int]:
    """Compute current and longest reading streaks.

    Args:
        active_dates: Set of dates with reading activity (UTC dates).
        today: Override "today" for testing. Defaults to UTC today
            (consistent with how active_dates are derived from UTC-grouped queries).

    Returns:
        (current_streak, longest_streak)
    """
    if not active_dates:
        return 0, 0

    # active_dates are derived from `func.date(started_at)` where started_at is
    # stored as naive UTC, so the dates are UTC dates. Use UTC today to match.
    today = today or datetime.now(tz=UTC).date()

    # Current streak: count consecutive days ending at today
    current = 0
    d = today
    while d in active_dates:
        current += 1
        d -= timedelta(days=1)

    # Longest streak: scan all sorted dates
    sorted_dates = sorted(active_dates)
    longest = 1
    streak = 1
    for i in range(1, len(sorted_dates)):
        if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 1

    return current, longest
