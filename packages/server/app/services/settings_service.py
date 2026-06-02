"""Business logic for user settings: get, update, reading goals."""

from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_user_settings(db: AsyncSession, user_id: UUID) -> dict:
    """Return the user's settings dict with a default language."""
    user = await _get_user(db, user_id)
    settings = user.settings or {}
    settings.setdefault('language', 'en')
    return settings


async def update_user_settings(
    db: AsyncSession,
    user_id: UUID,
    updates: dict,
) -> dict:
    """Shallow-merge *updates* into the user's existing settings."""
    user = await _get_user(db, user_id)
    user.settings = {**(user.settings or {}), **updates}
    await db.flush()
    return user.settings


async def get_reading_goals(db: AsyncSession, user_id: UUID) -> dict:
    """Compute reading-goal progress from today's sessions and weekly completions."""
    from app.models.book import Book, BookStatus  # noqa: avoid circular at module level
    from app.models.reading_session import ReadingSession

    user = await _get_user(db, user_id)
    settings = user.settings or {}
    goals_prefs = settings.get('readingGoals', {
        'dailyMinutes': 30,
        'weeklyBooks': 1,
        'monthlyBooks': 4,
    })

    daily_goal_minutes = goals_prefs.get('dailyMinutes', 30)
    weekly_books_goal = goals_prefs.get('weeklyBooks', 1)

    # Today's reading time
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            and_(
                ReadingSession.user_id == user_id,
                ReadingSession.started_at >= today_start,
            )
        )
    )
    today_minutes = int(today_seconds or 0) // 60

    # Books completed this week
    week_start = datetime.combine(
        date.today() - timedelta(days=date.today().weekday()),
        datetime.min.time(),
    )
    completed_this_week = await db.scalar(
        select(func.count(Book.id)).where(
            and_(
                Book.user_id == user_id,
                Book.status == BookStatus.completed.value,
                Book.completed_at >= week_start,
            )
        )
    )

    completed = completed_this_week or 0
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
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError('user_not_found')
    return user
