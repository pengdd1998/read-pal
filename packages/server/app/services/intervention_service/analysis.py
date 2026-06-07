"""Reading-pattern analysis — core intervention detection logic.

Re-exports from submodules for backward compatibility.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.intervention_service.checks import (
    GAP_DAYS,
    LONG_SESSION_MINUTES,
    LOW_ENGAGEMENT_THRESHOLD,
    MARATHON_SESSIONS,
    OPTIMAL_TIMING_RATIO,
    RE_READING_OVERLAP,
    SPEED_DROP_THRESHOLD,
    check_long_session,
    check_low_engagement,
    check_marathon,
    check_optimal_timing,
    check_re_reading,
    check_speed_drop,
    check_welcome_back,
    compute_page_range,
    format_hour_window,
    pages_overlap_pct,
)
from app.services.intervention_service.data import (
    fetch_extended_sessions,
    fetch_recent_sessions,
)

__all__ = [
    # Thresholds
    'LONG_SESSION_MINUTES',
    'MARATHON_SESSIONS',
    'GAP_DAYS',
    'LOW_ENGAGEMENT_THRESHOLD',
    'SPEED_DROP_THRESHOLD',
    'RE_READING_OVERLAP',
    'OPTIMAL_TIMING_RATIO',
    # Helpers
    'compute_page_range',
    'pages_overlap_pct',
    'format_hour_window',
    # Checks
    'check_speed_drop',
    'check_re_reading',
    'check_optimal_timing',
    'check_marathon',
    'check_long_session',
    'check_low_engagement',
    'check_welcome_back',
    # Data
    'fetch_recent_sessions',
    'fetch_extended_sessions',
]


# ---------------------------------------------------------------------------
# Core orchestration
# ---------------------------------------------------------------------------


async def analyze_reading_pattern(
    db: AsyncSession,
    user_id: str,
    book_id: str | None = None,
) -> dict | None:
    """Return an intervention dict if one is warranted, else None."""
    sessions, today_sessions = await fetch_recent_sessions(db, user_id, book_id)

    return (
        check_marathon(today_sessions)
        or check_long_session(today_sessions)
        or check_low_engagement(sessions)
        or check_welcome_back(sessions, today_sessions)
        or check_speed_drop(sessions)
        or check_re_reading(sessions)
        or await _check_optimal_timing(db, user_id, book_id)
    )


async def _check_optimal_timing(db: AsyncSession, user_id: str, book_id: str | None) -> dict | None:
    """Fetch extended sessions and run optimal timing check."""
    extended = await fetch_extended_sessions(db, user_id, book_id)
    return check_optimal_timing(extended)
