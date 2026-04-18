"""User settings routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.settings import SettingsUpdate

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
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
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
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
        )

    user.settings = {**(user.settings or {}), **body}
    await db.flush()

    return {'success': True, 'data': user.settings}


@router.get('/reading-goals')
async def get_reading_goals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get reading goals from user settings."""
    result = await db.execute(
        select(User).where(User.id == UUID(current_user['id'])),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
        )

    settings = user.settings or {}
    goals = settings.get('readingGoals', {
        'dailyMinutes': 30,
        'weeklyBooks': 1,
        'monthlyBooks': 4,
    })
    return {'success': True, 'data': goals}
