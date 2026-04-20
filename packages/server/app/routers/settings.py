"""User settings routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.reading_session import ReadingSession
from app.models.user import User
from app.schemas.settings import SettingsUpdate
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/settings', tags=['settings'])


@router.get('/')
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's settings."""
    result = await db.execute(
        select(User).where(User.id == UUID(current_user['id'])),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )

    return {'success': True, 'data': user.settings or {}}


@router.patch('/')
async def update_settings(
    body: SettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update user settings with a shallow merge.

    Body should be a JSON object to merge into existing settings:
    ``{"theme": "dark", "fontSize": 18}``
    """
    result = await db.execute(
        select(User).where(User.id == UUID(current_user['id'])),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )

    user.settings = {**(user.settings or {}), **body.model_dump(exclude_unset=True)}
    await db.flush()

    return {'success': True, 'data': user.settings}


@router.get('/reading-goals')
async def get_reading_goals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get reading goals with computed progress from today's sessions."""
    uid = UUID(current_user['id'])

    result = await db.execute(
        select(User).where(User.id == uid),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )

    settings = user.settings or {}
    goals_prefs = settings.get('readingGoals', {
        'dailyMinutes': 30,
        'weeklyBooks': 1,
        'monthlyBooks': 4,
    })

    daily_goal_minutes = goals_prefs.get('dailyMinutes', 30)
    weekly_books_goal = goals_prefs.get('weeklyBooks', 1)

    # Compute today's reading time
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_seconds = await db.scalar(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            and_(
                ReadingSession.user_id == uid,
                ReadingSession.started_at >= today_start,
            )
        )
    )
    today_minutes = int(today_seconds or 0) // 60

    # Count books completed this week
    week_start = datetime.combine(
        date.today() - timedelta(days=date.today().weekday()),
        datetime.min.time(),
    )
    from app.models.book import Book, BookStatus  # noqa: avoid circular at module level
    completed_this_week = await db.scalar(
        select(func.count(Book.id)).where(
            and_(
                Book.user_id == uid,
                Book.status == BookStatus.completed.value,
                Book.completed_at >= week_start,
            )
        )
    )

    completed = completed_this_week or 0
    on_track = completed >= weekly_books_goal
    daily_on_track = today_minutes >= daily_goal_minutes

    return {
        'success': True,
        'data': {
            'goal': weekly_books_goal,
            'completed': completed,
            'onTrack': on_track,
            'dailyGoalMinutes': daily_goal_minutes,
            'todayMinutes': today_minutes,
            'dailyOnTrack': daily_on_track,
        },
    }
