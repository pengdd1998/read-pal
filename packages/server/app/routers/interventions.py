"""Intervention routes — reading interruption checks and feedback.

The check endpoint analyses the user's recent reading sessions to detect
patterns that suggest a break or encouragement is warranted:

- Long streak without reading (marathon detection)
- Declining engagement (fewer highlights/notes per session)
- Session too long without a break
- Recently returned after a gap (welcome back)
"""

import json
from collections import Counter
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.db import get_db
from app.middleware.auth import get_current_user
from app.utils import utcnow
from app.models.intervention_feedback import InterventionFeedback
from app.schemas.common import GenericResponse
from app.schemas.intervention import (
    InterventionCheckRequest,
    InterventionFeedbackRequest,
    InterventionPreferencesRequest,
)
from app.utils.i18n import t
from app.models.reading_session import ReadingSession

router = APIRouter(prefix='/api/v1/interventions', tags=['interventions'])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Thresholds
_LONG_SESSION_MINUTES = 90        # reading > 90 min → break suggestion
_MARATHON_SESSIONS = 5            # 5+ sessions in a day → marathon detection
_GAP_DAYS = 3                     # no reading for 3+ days → welcome back
_LOW_ENGAGEMENT_THRESHOLD = 0.5   # < 0.5 highlights per session → low engagement
_SPEED_DROP_THRESHOLD = 0.30      # 30% speed drop → speed_drop intervention
_RE_READING_OVERLAP = 0.50        # 50% page overlap → re_reading intervention
_OPTIMAL_TIMING_RATIO = 0.60      # 60% of sessions in 3h window → optimal_timing


def _compute_page_range(
    earlier_sessions: list[ReadingSession],
    session: ReadingSession,
) -> tuple[int, int]:
    """Estimate page range (start, end) for a session based on prior sessions."""
    prior_pages = sum(s.pages_read for s in earlier_sessions)
    start_page = prior_pages + 1
    end_page = prior_pages + session.pages_read
    return (start_page, end_page)


def _pages_overlap_pct(
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


def _format_hour_window(peak_hour: int) -> str:
    """Format a 3-hour window starting at *peak_hour* for display."""
    h1 = peak_hour % 24
    h2 = (peak_hour + 1) % 24
    h3 = (peak_hour + 2) % 24
    return f'{h1}:00–{h3}:59 (peak at {h2}:00)'


def _check_speed_drop(sessions: list[ReadingSession]) -> dict | None:
    """Detect if the latest session's reading speed dropped >30% vs average."""
    if len(sessions) < 4:
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
    if avg_speed > 0 and latest_speed < avg_speed * (1 - _SPEED_DROP_THRESHOLD):
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


def _check_re_reading(sessions: list[ReadingSession]) -> dict | None:
    """Detect re-reading by checking page-range overlap in last 3 sessions."""
    if len(sessions) < 3:
        return None
    sorted_sessions = sorted(sessions, key=lambda s: s.started_at)
    # Group last 3 sessions by book — all must be the same book
    last_three = sorted_sessions[-3:]
    book_ids = {s.book_id for s in last_three}
    if len(book_ids) != 1:
        return None
    # Build estimated page ranges for these 3 sessions
    # Use all prior sessions for that book to estimate cumulative position
    book_sessions = [
        s for s in sorted_sessions if s.book_id == last_three[0].book_id
    ]
    ranges: list[tuple[int, int]] = []
    for s in book_sessions:
        if s in last_three:
            prior = [bs for bs in book_sessions if bs.started_at < s.started_at]
            ranges.append(_compute_page_range(prior, s))
    if len(ranges) < 3:
        return None
    # Check pairwise overlap between the 3 ranges
    overlaps = 0
    pairs = [(0, 1), (1, 2), (0, 2)]
    for a, b in pairs:
        if _pages_overlap_pct(ranges[a], ranges[b]) > _RE_READING_OVERLAP:
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


def _check_optimal_timing(sessions: list[ReadingSession]) -> dict | None:
    """Suggest optimal reading time if sessions cluster in a 3-hour window."""
    if len(sessions) < 5:
        return None
    # Count sessions per starting hour
    hour_counts: Counter[int] = Counter()
    for s in sessions:
        if s.started_at:
            hour_counts[s.started_at.hour] += 1
    if not hour_counts:
        return None
    # Slide a 3-hour window and find the densest cluster
    total = len(sessions)
    best_hour = 0
    best_count = 0
    for h in range(24):
        window_count = sum(hour_counts[(h + i) % 24] for i in range(3))
        if window_count > best_count:
            best_count = window_count
            best_hour = h
    if best_count / total >= _OPTIMAL_TIMING_RATIO:
        hour_range = _format_hour_window(best_hour)
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


async def _analyze_reading_pattern(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
) -> dict | None:
    """Return an intervention dict if one is warranted, else None."""
    now = utcnow()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    # Recent sessions (last 7 days)
    q = select(ReadingSession).where(
        ReadingSession.user_id == user_id,
        ReadingSession.started_at >= week_ago,
    )
    if book_id:
        q = q.where(ReadingSession.book_id == book_id)
    sessions = (await db.execute(q)).scalars().all()

    # Today's sessions
    today_q = select(ReadingSession).where(
        ReadingSession.user_id == user_id,
        ReadingSession.started_at >= day_ago,
    )
    if book_id:
        today_q = today_q.where(ReadingSession.book_id == book_id)
    today_sessions = (await db.execute(today_q)).scalars().all()

    # --- Check 1: marathon (too many sessions today) ---
    if len(today_sessions) >= _MARATHON_SESSIONS:
        total_minutes = sum(s.duration for s in today_sessions) // 60
        return {
            'interventionNeeded': True,
            'type': 'marathon',
            'priority': 'medium',
            'message': (
                f"You've been reading for {len(today_sessions)} sessions "
                f"today ({total_minutes} min). Consider taking a break to "
                'let the material sink in.'
            ),
        }

    # --- Check 2: long current session ---
    active = [s for s in today_sessions if s.is_active]
    if active:
        longest = max(active, key=lambda s: s.duration)
        minutes = longest.duration // 60
        if minutes >= _LONG_SESSION_MINUTES:
            return {
                'interventionNeeded': True,
                'type': 'long_session',
                'priority': 'high',
                'message': (
                    f'You have been reading for {minutes} minutes. '
                    'A short break can improve retention and focus.'
                ),
            }

    # --- Check 3: declining engagement ---
    if len(sessions) >= 4:
        recent = sessions[:len(sessions) // 2]
        older = sessions[len(sessions) // 2:]
        recent_engagement = sum(s.highlights + s.notes for s in recent) / max(
            len(recent), 1,
        )
        older_engagement = sum(s.highlights + s.notes for s in older) / max(
            len(older), 1,
        )
        if (
            older_engagement > _LOW_ENGAGEMENT_THRESHOLD
            and recent_engagement < older_engagement * 0.3
        ):
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

    # --- Check 4: welcome back after gap ---
    if not today_sessions and sessions:
        last_session = max(sessions, key=lambda s: s.started_at)
        gap = now - last_session.started_at
        if gap >= timedelta(days=_GAP_DAYS):
            return {
                'interventionNeeded': True,
                'type': 'welcome_back',
                'priority': 'medium',
                'message': (
                    f'Welcome back! It\'s been {gap.days} days since your '
                    'last reading session. Pick up where you left off?'
                ),
            }

    # --- Check 5: speed drop ---
    speed_drop = _check_speed_drop(sessions)
    if speed_drop:
        return speed_drop

    # --- Check 6: re-reading detection ---
    re_reading = _check_re_reading(sessions)
    if re_reading:
        return re_reading

    # --- Check 7: optimal timing ---
    two_weeks_ago = now - timedelta(days=14)
    extended_q = select(ReadingSession).where(
        ReadingSession.user_id == user_id,
        ReadingSession.started_at >= two_weeks_ago,
    )
    if book_id:
        extended_q = extended_q.where(ReadingSession.book_id == book_id)
    extended_sessions = (await db.execute(extended_q)).scalars().all()
    optimal = _check_optimal_timing(extended_sessions)
    if optimal:
        return optimal

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post('/check', response_model=GenericResponse)
async def check_intervention(
    body: InterventionCheckRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if a reading intervention is needed based on reading patterns."""
    user_id = UUID(current_user['id'])
    book_id = body.book_id or body.bookId
    book_uuid = UUID(str(book_id)) if book_id else None

    intervention = await _analyze_reading_pattern(db, user_id, book_uuid)

    if intervention:
        return {'success': True, 'data': intervention}

    return {
        'success': True,
        'data': {
            'interventionNeeded': False,
            'type': None,
            'priority': None,
            'message': None,
        },
    }


@router.post('/feedback', response_model=GenericResponse)
async def submit_feedback(
    body: InterventionFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Store intervention feedback."""
    user_id = UUID(current_user['id'])
    book_id = body.book_id or body.bookId

    feedback = InterventionFeedback(
        user_id=user_id,
        book_id=UUID(str(book_id)) if book_id else None,
        intervention_type=body.type,
        helpful=body.helpful,
        dismissed=body.dismissed,
        context=body.context,
    )
    db.add(feedback)
    await db.commit()

    return {'success': True, 'data': {'message': t('errors.feedback_recorded')}}


# ---------------------------------------------------------------------------
# Default preferences
# ---------------------------------------------------------------------------

_DEFAULT_PREFS: dict = {
    'marathonEnabled': True,
    'longSessionEnabled': True,
    'lowEngagementEnabled': True,
    'welcomeBackEnabled': True,
    'speedDropEnabled': True,
    'reReadingEnabled': True,
    'optimalTimingEnabled': True,
    'quietHoursStart': None,
    'quietHoursEnd': None,
}


def _prefs_redis_key(user_id: UUID) -> str:
    return f'intervention_prefs:{user_id}'


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@router.get('/history', response_model=GenericResponse)
async def get_intervention_history(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the last 20 intervention feedback records for the current user."""
    user_id = UUID(current_user['id'])

    stmt = (
        select(InterventionFeedback)
        .where(InterventionFeedback.user_id == user_id)
        .order_by(InterventionFeedback.created_at.desc())
        .limit(20)
    )
    rows = (await db.execute(stmt)).scalars().all()

    history = [
        {
            'id': str(row.id),
            'interventionType': row.intervention_type,
            'userAction': 'helpful' if row.helpful else (
                'dismissed' if row.dismissed else 'seen'
            ),
            'createdAt': row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]

    return {'success': True, 'data': history}


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------


@router.get('/preferences', response_model=GenericResponse)
async def get_intervention_preferences(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the user's intervention preferences (or defaults)."""
    user_id = UUID(current_user['id'])
    redis = get_redis()
    raw = await redis.get(_prefs_redis_key(user_id))

    if raw:
        prefs = json.loads(raw)
    else:
        prefs = {**_DEFAULT_PREFS}

    return {'success': True, 'data': prefs}


@router.put('/preferences', response_model=GenericResponse)
async def update_intervention_preferences(
    body: InterventionPreferencesRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Store the user's intervention preferences in Redis."""
    user_id = UUID(current_user['id'])
    redis = get_redis()

    prefs = {**_DEFAULT_PREFS}
    # Merge incoming values over defaults
    for field in (
        'marathonEnabled',
        'longSessionEnabled',
        'lowEngagementEnabled',
        'welcomeBackEnabled',
        'speedDropEnabled',
        'reReadingEnabled',
        'optimalTimingEnabled',
        'quietHoursStart',
        'quietHoursEnd',
    ):
        val = getattr(body, field, None)
        if val is not None:
            prefs[field] = val

    await redis.set(
        _prefs_redis_key(user_id),
        json.dumps(prefs),
        ex=60 * 60 * 24 * 365,  # 1 year TTL
    )

    return {'success': True, 'data': prefs}
