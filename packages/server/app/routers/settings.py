"""User settings routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter, write_limiter
from app.schemas.common import GenericResponse
from app.schemas.settings import SettingsUpdate, ZoteroValidateRequest
from app.services import settings_service
from app.utils.i18n import not_found_error, t
import logging

logger = logging.getLogger('read-pal.settings')

ZOTERO_API_BASE = 'https://api.zotero.org'
ZOTERO_TIMEOUT = 10.0

router = APIRouter(
    prefix='/api/v1/settings',
    tags=['settings'],
    dependencies=[api_limiter],
)


class PushTokenRequest(BaseModel):
    push_token: str = Field('', max_length=512)


@router.get('', response_model=GenericResponse)
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the authenticated user's settings."""
    try:
        settings = await settings_service.get_user_settings(db, UUID(current_user['id']))
    except ValueError:
        logger.debug('validation error in settings')
        raise not_found_error(t('errors.user_not_found'))
    return {'success': True, 'data': settings}


@router.patch('', response_model=GenericResponse, dependencies=[write_limiter])
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
        logger.debug('validation error in settings')
        raise not_found_error(t('errors.user_not_found'))
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
        logger.debug('validation error in settings')
        raise not_found_error(t('errors.user_not_found'))
    return {'success': True, 'data': goals}


@router.post('/zotero/validate', response_model=GenericResponse, dependencies=[write_limiter])
async def validate_zotero_key(
    body: ZoteroValidateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Validate a Zotero API key by fetching the user profile."""
    url = f'{ZOTERO_API_BASE}/users/{body.userId}/keys/{body.apiKey}'
    try:
        async with httpx.AsyncClient(timeout=ZOTERO_TIMEOUT) as client:
            resp = await client.get(
                url,
                headers={'Zotero-API-Key': body.apiKey},
            )
        if resp.status_code == 200:
            data = resp.json()
            username = data.get('username', data.get('userID', ''))
            return {'success': True, 'data': {'valid': True, 'username': str(username)}}
        return {
            'success': True,
            'data': {'valid': False, 'error': 'Invalid Zotero credentials'},
        }
    except httpx.HTTPError as exc:
        logger.warning('zotero_api_error: %s', str(exc)[:200])
        return {
            'success': True,
            'data': {'valid': False, 'error': 'Could not reach Zotero API'},
        }


@router.post('/push-token', response_model=GenericResponse, dependencies=[write_limiter])
async def register_push_token(
    body: PushTokenRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register or update a push notification token (mobile)."""
    if not body.push_token:
        return {'success': True, 'data': {'registered': False}}
    await settings_service.update_user_settings(
        db, UUID(current_user['id']), {'pushToken': body.push_token},
    )
    return {'success': True, 'data': {'registered': True}}
