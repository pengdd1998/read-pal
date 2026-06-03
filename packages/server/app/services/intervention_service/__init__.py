"""Intervention service package — reading pattern analysis, feedback, and preferences.

Re-exports all public symbols so that existing imports continue to work::

    from app.services.intervention_service import analyze_reading_pattern
"""

from app.services.intervention_service.analysis import (
    LONG_SESSION_MINUTES,
    MARATHON_SESSIONS,
    GAP_DAYS,
    LOW_ENGAGEMENT_THRESHOLD,
    SPEED_DROP_THRESHOLD,
    RE_READING_OVERLAP,
    OPTIMAL_TIMING_RATIO,
    analyze_reading_pattern,
    check_optimal_timing,
    check_re_reading,
    check_speed_drop,
    compute_page_range,
    format_hour_window,
    pages_overlap_pct,
)
from app.services.intervention_service.feedback import (
    get_feedback_history,
    store_feedback,
)
from app.services.intervention_service.preferences import (
    DEFAULT_PREFS,
    get_preferences,
    update_preferences,
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
    'DEFAULT_PREFS',
    # Analysis
    'analyze_reading_pattern',
    'check_optimal_timing',
    'check_re_reading',
    'check_speed_drop',
    'compute_page_range',
    'format_hour_window',
    'pages_overlap_pct',
    # Feedback
    'get_feedback_history',
    'store_feedback',
    # Preferences
    'get_preferences',
    'update_preferences',
]
