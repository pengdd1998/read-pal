"""Stats subpackage — re-exports all public functions."""

from app.services.stats.calendar import get_reading_calendar, get_weekly_summary
from app.services.stats.dashboard import (
    get_dashboard_stats,
    invalidate_dashboard_cache,
)
from app.services.stats.flashcards import get_flashcard_stats
from app.services.stats.reading_speed import (
    get_reading_speed,
    get_reading_speed_by_book,
)

__all__ = [
    'get_dashboard_stats',
    'invalidate_dashboard_cache',
    'get_reading_calendar',
    'get_weekly_summary',
    'get_reading_speed',
    'get_reading_speed_by_book',
    'get_flashcard_stats',
]
