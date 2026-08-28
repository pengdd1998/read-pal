"""Business logic for user settings: get, update, reading goals."""

import logging
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.utils.db import db_error_guard
from app.utils.i18n import DEFAULT_LANGUAGE
from app.utils.time import utc_start_of_day, utc_start_of_week

logger = logging.getLogger('read-pal.settings')


async def get_user_settings(db: AsyncSession, user_id: UUID) -> dict:
    """Return the user's settings dict with a default language."""
    user = await _get_user(db, user_id)
    settings = user.settings or {}
    settings.setdefault('language', DEFAULT_LANGUAGE)
    return settings


async def update_user_settings(
    db: AsyncSession,
    user_id: UUID,
    updates: dict,
) -> dict:
    """Shallow-merge *updates* into the user's existing settings."""
    async with db_error_guard('update_user_settings', user_id=str(user_id)):
        user = await _get_user(db, user_id)
        user.settings = {**(user.settings or {}), **updates}
        await db.flush()
    return user.settings


async def _get_today_reading_minutes(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Return total minutes the user has read today (UTC day, capped at 24h)."""
    from app.models.reading_session import ReadingSession

    async with db_error_guard('_get_today_reading_minutes', user_id=str(user_id)):
        # tz-aware UTC midnight — asyncpg/SQLAlchemy interprets naive datetimes
        # using the client process TZ, which silently shifts the bound value.
        today_start = utc_start_of_day()
        today_seconds = await db.scalar(
            select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
                and_(
                    ReadingSession.user_id == user_id,
                    ReadingSession.started_at >= today_start,
                )
            )
        )
    # Hard upper bound: a single day cannot have more than 24h of reading.
    # Guards against any future duration-inflation regression.
    day_cap = 24 * 3600
    return min(int(today_seconds or 0), day_cap) // 60


async def _get_weekly_completed_books(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Return number of books the user completed this week (UTC week, Mon-Sun)."""
    from app.models.book import Book, BookStatus

    async with db_error_guard('_get_weekly_completed_books', user_id=str(user_id)):
        week_start = utc_start_of_week()
        completed_this_week = await db.scalar(
            select(func.count(Book.id)).where(
                and_(
                    Book.user_id == user_id,
                    Book.status == BookStatus.completed.value,
                    Book.completed_at >= week_start,
                )
            )
        )
    return completed_this_week or 0


async def get_reading_goals(db: AsyncSession, user_id: UUID) -> dict:
    """Compute reading-goal progress from today's sessions and weekly completions."""
    user = await _get_user(db, user_id)
    settings = user.settings or {}
    goals_prefs = settings.get('readingGoals', {
        'dailyMinutes': 30,
        'weeklyBooks': 1,
        'monthlyBooks': 4,
    })

    daily_goal_minutes = goals_prefs.get('dailyMinutes', 30)
    weekly_books_goal = goals_prefs.get('weeklyBooks', 1)

    today_minutes = await _get_today_reading_minutes(db, user_id)
    completed = await _get_weekly_completed_books(db, user_id)

    return {
        'goal': weekly_books_goal,
        'completed': completed,
        'onTrack': completed >= weekly_books_goal,
        'dailyGoalMinutes': daily_goal_minutes,
        'todayMinutes': today_minutes,
        'dailyOnTrack': today_minutes >= daily_goal_minutes,
    }


async def _get_user(db: AsyncSession, user_id: UUID) -> User:
    """Fetch user or raise ValueError."""
    async with db_error_guard('_get_user', user_id=str(user_id)):
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    if user is None:
        raise ValueError('user_not_found')
    return user
