"""Intervention routes — reading interruption checks and feedback.

The check endpoint analyses the user's recent reading sessions to detect
patterns that suggest a break or encouragement is warranted:

- Long streak without reading (marathon detection)
- Declining engagement (fewer highlights/notes per session)
- Session too long without a break
- Recently returned after a gap (welcome back)
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.intervention_feedback import InterventionFeedback
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


async def _analyze_reading_pattern(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
) -> dict | None:
    """Return an intervention dict if one is warranted, else None."""
    now = datetime.now(timezone.utc)
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
                'message': (
                    f'Welcome back! It\'s been {gap.days} days since your '
                    'last reading session. Pick up where you left off?'
                ),
            }

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post('/check')
async def check_intervention(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if a reading intervention is needed based on reading patterns."""
    user_id = UUID(current_user['id'])
    book_id = body.get('bookId') or body.get('book_id')
    book_uuid = UUID(book_id) if book_id else None

    intervention = await _analyze_reading_pattern(db, user_id, book_uuid)

    if intervention:
        return {'success': True, 'data': intervention}

    return {
        'success': True,
        'data': {
            'interventionNeeded': False,
            'type': None,
            'message': None,
        },
    }


@router.post('/feedback')
async def submit_feedback(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Store intervention feedback."""
    user_id = UUID(current_user['id'])
    intervention_type = body.get('type', '')
    helpful = body.get('helpful', False)
    dismissed = body.get('dismissed', False)
    book_id = body.get('bookId') or body.get('book_id')

    feedback = InterventionFeedback(
        user_id=user_id,
        book_id=UUID(book_id) if book_id else None,
        intervention_type=intervention_type,
        helpful=helpful,
        dismissed=dismissed,
        context=body.get('context'),
    )
    db.add(feedback)
    await db.commit()

    return {'success': True, 'data': {'message': 'Feedback recorded'}}
