"""Reading-pattern analysis — core intervention detection logic."""

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession
from app.utils import utcnow

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
_MIN_SESSIONS_ANALYSIS = 4       # sessions needed for engagement analysis
_MIN_SESSIONS_TREND = 3          # sessions needed for re-reading trend
_MIN_SESSIONS_STREAK = 5         # sessions needed for optimal timing
_ENGAGEMENT_DROP_RATIO = 0.3     # engagement drop ratio for low_engagement alert


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
    if len(sessions) < _MIN_SESSIONS_ANALYSIS:
        return None
    sorted_sessions = sorted(sessions, key=lambda s: s.started_at)
    prior = sorted_sessions[:-1]
    latest = sorted_sessions[-1]
    # Average speed from prior sessions (pages per minute)
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
            'message': (
                'Your reading speed dropped significantly — is the material '
                'getting challenging? I can help explain difficult sections.'
            ),
        }
    return None


def check_re_reading(sessions: list[ReadingSession]) -> dict | None:
    """Detect re-reading by checking page-range overlap in last 3 sessions."""
    if len(sessions) < _MIN_SESSIONS_TREND:
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
            'message': (
                'I noticed you\'re revisiting the same section. '
                'Want me to explain or summarize this part?'
            ),
        }
    return None


def check_optimal_timing(sessions: list[ReadingSession]) -> dict | None:
    """Suggest optimal reading time if sessions cluster in a 3-hour window."""
    from collections import Counter

    if len(sessions) < _MIN_SESSIONS_STREAK:
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
            'message': (
                f'Your data shows you read best between {hour_range}. '
                'That might be your golden reading window!'
            ),
        }
    return None


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------


def _build_session_query(
    user_id: UUID,
    since,
    book_id: UUID | None = None,
):
    """Build a ReadingSession query scoped to *user_id* and *since*."""
    q = select(ReadingSession).where(
        ReadingSession.user_id == user_id,
        ReadingSession.started_at >= since,
    )
    if book_id:
        q = q.where(ReadingSession.book_id == book_id)
    return q


async def _fetch_recent_sessions(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
) -> tuple[list, list]:
    """Return (weekly_sessions, today_sessions) for the given user/book."""
    now = utcnow()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    q = _build_session_query(user_id, week_ago, book_id)
    sessions = (await db.execute(q)).scalars().all()

    today_q = _build_session_query(user_id, day_ago, book_id)
    today_sessions = (await db.execute(today_q)).scalars().all()
    return sessions, today_sessions


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
        'message': (
            f"You've been reading for {len(today_sessions)} sessions "
            f'today ({total_minutes} min). Consider taking a break to '
            'let the material sink in.'
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
        'message': (
            f'You have been reading for {minutes} minutes. '
            'A short break can improve retention and focus.'
        ),
    }


def check_low_engagement(sessions: list) -> dict | None:
    """Detect a recent drop in highlights/notes engagement."""
    if len(sessions) < _MIN_SESSIONS_ANALYSIS:
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
        'message': (
            'Your highlights and notes have dropped recently. '
            'Try pausing to reflect on what you\'ve read — active '
            'engagement helps retention.'
        ),
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
        'message': (
            f'Welcome back! It\'s been {gap.days} days since your '
            'last reading session. Pick up where you left off?'
        ),
    }


async def _fetch_extended_sessions(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
) -> list:
    """Fetch sessions from the last 14 days for timing analysis."""
    two_weeks_ago = utcnow() - timedelta(days=14)
    q = _build_session_query(user_id, two_weeks_ago, book_id)
    return (await db.execute(q)).scalars().all()


# ---------------------------------------------------------------------------
# Core orchestration
# ---------------------------------------------------------------------------


async def analyze_reading_pattern(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
) -> dict | None:
    """Return an intervention dict if one is warranted, else None."""
    sessions, today_sessions = await _fetch_recent_sessions(db, user_id, book_id)

    return (
        check_marathon(today_sessions)
        or check_long_session(today_sessions)
        or check_low_engagement(sessions)
        or check_welcome_back(sessions, today_sessions)
        or check_speed_drop(sessions)
        or check_re_reading(sessions)
        or await _check_optimal_timing(db, user_id, book_id)
    )


async def _check_optimal_timing(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None,
) -> dict | None:
    """Fetch extended sessions and run optimal timing check."""
    extended = await _fetch_extended_sessions(db, user_id, book_id)
    return check_optimal_timing(extended)
