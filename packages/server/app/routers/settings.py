"""User settings routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.schemas.settings import SettingsUpdate
from app.services import settings_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/settings', tags=['settings'])


@router.get('', response_model=GenericResponse)
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's settings."""
    try:
        settings = await settings_service.get_user_settings(db, UUID(current_user['id']))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )
    return {'success': True, 'data': settings}


@router.patch('', response_model=GenericResponse)
async def update_settings(
    body: SettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update user settings with a shallow merge."""
    try:
        settings = await settings_service.update_user_settings(
            db,
            UUID(current_user['id']),
            body.model_dump(exclude_unset=True),
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )
    return {'success': True, 'data': settings}


@router.get('/reading-goals', response_model=GenericResponse)
async def get_reading_goals(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get reading goals with computed progress from today's sessions."""
    try:
        goals = await settings_service.get_reading_goals(db, UUID(current_user['id']))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )
    return {'success': True, 'data': goals}
