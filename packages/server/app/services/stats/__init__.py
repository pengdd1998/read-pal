"""Stats subpackage — re-exports all public functions."""

from datetime import timedelta

# Shared lookback window for streak computation
STATS_LOOKBACK_DAYS = 60
STATS_LOOKBACK_DELTA = timedelta(days=STATS_LOOKBACK_DAYS)

from app.services.stats.calendar import get_reading_calendar, get_weekly_summary
from app.services.stats.dashboard import (
    get_dashboard_stats,
    invalidate_dashboard_cache,
)
from app.services.stats.dashboard_cache import (
    book_stats_cache_key,
    invalidate_user_caches,
)
from app.services.stats.flashcards import get_flashcard_stats
from app.services.stats.reading_speed import (
    get_reading_speed,
    get_reading_speed_by_book,
)

__all__ = [
    'get_dashboard_stats',
    'invalidate_dashboard_cache',
    'invalidate_user_caches',
    'book_stats_cache_key',
    'get_reading_calendar',
    'get_weekly_summary',
    'get_reading_speed',
    'get_reading_speed_by_book',
    'get_flashcard_stats',
]
