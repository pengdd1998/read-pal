"""Individual intervention detection check functions."""

from collections import Counter
from datetime import timedelta

from app.models.reading_session import ReadingSession
from app.utils import utcnow
from app.utils.i18n import t

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

LONG_SESSION_MINUTES = 90        # reading > 90 min -> break suggestion
MARATHON_SESSIONS = 5            # 5+ sessions in a day -> marathon detection
GAP_DAYS = 3                     # no reading for 3+ days -> welcome back
LOW_ENGAGEMENT_THRESHOLD = 0.5   # < 0.5 highlights per session -> low engagement
SPEED_DROP_THRESHOLD = 0.30      # 30% speed drop -> speed_drop intervention
RE_READING_OVERLAP = 0.50        # 50% page overlap -> re_reading intervention
OPTIMAL_TIMING_RATIO = 0.60      # 60% of sessions in 3h window -> optimal_timing

# Minimum session counts for various checks
MIN_SESSIONS_ANALYSIS = 4       # sessions needed for engagement analysis
MIN_SESSIONS_TREND = 3          # sessions needed for re-reading trend
MIN_SESSIONS_STREAK = 5         # sessions needed for optimal timing
_ENGAGEMENT_DROP_RATIO = 0.3    # engagement drop ratio for low_engagement alert


# ---------------------------------------------------------------------------
# Pure helper functions
# ---------------------------------------------------------------------------


def compute_page_range(
    earlier_sessions: list[ReadingSession],
    session: ReadingSession,
) -> tuple[int, int]:
    """Estimate page range (start, end) for a session based on prior sessions."""
    prior_pages = sum(s.pages_read for s in earlier_sessions)
    start_page = prior_pages + 1
    end_page = prior_pages + session.pages_read
    return (start_page, end_page)


def pages_overlap_pct(
    range_a: tuple[int, int],
    range_b: tuple[int, int],
) -> float:
    """Return the fraction of range_a that overlaps with range_b."""
    if range_a[1] <= range_a[0] or range_b[1] <= range_b[0]:
        return 0.0
    overlap_start = max(range_a[0], range_b[0])
    overlap_end = min(range_a[1], range_b[1])
    overlap = max(0, overlap_end - overlap_start + 1)
    span = range_a[1] - range_a[0] + 1
    return overlap / span if span > 0 else 0.0


def format_hour_window(peak_hour: int) -> str:
    """Format a 3-hour window starting at *peak_hour* for display."""
    h1 = peak_hour % 24
    h2 = (peak_hour + 1) % 24
    h3 = (peak_hour + 2) % 24
    return f'{h1}:00–{h3}:59 (peak at {h2}:00)'


# ---------------------------------------------------------------------------
# Detection check functions
# ---------------------------------------------------------------------------


def check_speed_drop(sessions: list[ReadingSession]) -> dict | None:
    """Detect if the latest session's reading speed dropped >30% vs average."""
    if len(sessions) < MIN_SESSIONS_ANALYSIS:
        return None
    sorted_sessions = sorted(sessions, key=lambda s: s.started_at)
    prior = sorted_sessions[:-1]
    latest = sorted_sessions[-1]
    total_pages = sum(s.pages_read for s in prior)
    total_minutes = sum(max(s.duration, 1) for s in prior) / 60
    if total_minutes == 0 or total_pages == 0:
        return None
    avg_speed = total_pages / total_minutes
    latest_minutes = max(latest.duration, 1) / 60
    latest_speed = latest.pages_read / latest_minutes
    if avg_speed > 0 and latest_speed < avg_speed * (1 - SPEED_DROP_THRESHOLD):
        return {
            'interventionNeeded': True,
            'type': 'speed_drop',
            'priority': 'medium',
            'message': t('interventions.speed_drop'),
        }
    return None


def check_re_reading(sessions: list[ReadingSession]) -> dict | None:
    """Detect re-reading by checking page-range overlap in last 3 sessions."""
    if len(sessions) < MIN_SESSIONS_TREND:
        return None
    sorted_sessions = sorted(sessions, key=lambda s: s.started_at)
    last_three = sorted_sessions[-3:]
    book_ids = {s.book_id for s in last_three}
    if len(book_ids) != 1:
        return None
    book_sessions = [
        s for s in sorted_sessions if s.book_id == last_three[0].book_id
    ]
    ranges: list[tuple[int, int]] = []
    for s in book_sessions:
        if s in last_three:
            prior = [bs for bs in book_sessions if bs.started_at < s.started_at]
            ranges.append(compute_page_range(prior, s))
    if len(ranges) < 3:
        return None
    overlaps = 0
    pairs = [(0, 1), (1, 2), (0, 2)]
    for a, b in pairs:
        if pages_overlap_pct(ranges[a], ranges[b]) > RE_READING_OVERLAP:
            overlaps += 1
    if overlaps >= 2:
        return {
            'interventionNeeded': True,
            'type': 're_reading',
            'priority': 'low',
            'message': t('interventions.re_reading'),
        }
    return None


def check_optimal_timing(sessions: list[ReadingSession]) -> dict | None:
    """Suggest optimal reading time if sessions cluster in a 3-hour window."""
    if len(sessions) < MIN_SESSIONS_STREAK:
        return None
    hour_counts: Counter[int] = Counter()
    for s in sessions:
        if s.started_at:
            hour_counts[s.started_at.hour] += 1
    if not hour_counts:
        return None
    total = len(sessions)
    best_hour = 0
    best_count = 0
    for h in range(24):
        window_count = sum(hour_counts[(h + i) % 24] for i in range(3))
        if window_count > best_count:
            best_count = window_count
            best_hour = h
    if best_count / total >= OPTIMAL_TIMING_RATIO:
        hour_range = format_hour_window(best_hour)
        return {
            'interventionNeeded': True,
            'type': 'optimal_timing',
            'priority': 'low',
            'message': t('interventions.optimal_timing', hour_range=hour_range),
        }
    return None


# ---------------------------------------------------------------------------
# Inline check helpers
# ---------------------------------------------------------------------------


def check_marathon(today_sessions: list) -> dict | None:
    """Detect too many sessions in a single day."""
    if len(today_sessions) < MARATHON_SESSIONS:
        return None
    total_minutes = sum(s.duration for s in today_sessions) // 60
    return {
        'interventionNeeded': True,
        'type': 'marathon',
        'priority': 'medium',
        'message': t(
            'interventions.marathon',
            session_count=len(today_sessions),
            total_minutes=total_minutes,
        ),
    }


def check_long_session(today_sessions: list) -> dict | None:
    """Detect a single session that has been running too long."""
    active = [s for s in today_sessions if s.is_active]
    if not active:
        return None
    longest = max(active, key=lambda s: s.duration)
    minutes = longest.duration // 60
    if minutes < LONG_SESSION_MINUTES:
        return None
    return {
        'interventionNeeded': True,
        'type': 'long_session',
        'priority': 'high',
        'message': t('interventions.long_session', minutes=minutes),
    }


def check_low_engagement(sessions: list) -> dict | None:
    """Detect a recent drop in highlights/notes engagement."""
    if len(sessions) < MIN_SESSIONS_ANALYSIS:
        return None
    recent = sessions[:len(sessions) // 2]
    older = sessions[len(sessions) // 2:]
    recent_engagement = sum(s.highlights + s.notes for s in recent) / max(
        len(recent), 1,
    )
    older_engagement = sum(s.highlights + s.notes for s in older) / max(
        len(older), 1,
    )
    if (
        older_engagement <= LOW_ENGAGEMENT_THRESHOLD
        or recent_engagement >= older_engagement * _ENGAGEMENT_DROP_RATIO
    ):
        return None
    return {
        'interventionNeeded': True,
        'type': 'low_engagement',
        'priority': 'low',
        'message': t('interventions.low_engagement'),
    }


def check_welcome_back(sessions: list, today_sessions: list) -> dict | None:
    """Detect a reading gap and suggest resuming."""
    if today_sessions or not sessions:
        return None
    now = utcnow()
    last_session = max(sessions, key=lambda s: s.started_at)
    gap = now - last_session.started_at
    if gap < timedelta(days=GAP_DAYS):
        return None
    return {
        'interventionNeeded': True,
        'type': 'welcome_back',
        'priority': 'medium',
        'message': t('interventions.welcome_back', days=gap.days),
    }
