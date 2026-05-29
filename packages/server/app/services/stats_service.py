"""Backward-compatible shim — delegates to the stats subpackage.

All logic has been moved to ``app.services.stats`` sub-modules.
This module re-exports every public function so existing imports continue to work.
"""

from app.services.stats import (  # noqa: F401
    get_dashboard_stats,
    get_flashcard_stats,
    get_reading_calendar,
    get_reading_speed,
    get_reading_speed_by_book,
    get_weekly_summary,
    invalidate_dashboard_cache,
)
