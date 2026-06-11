"""API key routes — CRUD for personal access tokens."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter, write_limiter
from app.schemas.api_key import ApiKeyCreateRequest
from app.schemas.common import GenericResponse
from app.services import api_key_service
from app.utils.i18n import not_found_error, t

router = APIRouter(
    prefix='/api/v1/api-keys',
    tags=['api-keys'],
    dependencies=[api_limiter],
)


@router.get('', response_model=GenericResponse)
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List user's API keys (prefixes only, never full keys)."""
    keys = await api_key_service.list_keys(db, UUID(user['id']))
    return {'success': True, 'data': keys}


_MAX_KEYS_PER_USER = 5


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse, dependencies=[write_limiter])
async def create_api_key(
    body: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new API key (max 5 per user)."""
    uid = UUID(user['id'])
    existing = await api_key_service.list_keys(db, uid)
    if len(existing) >= _MAX_KEYS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'LIMIT_REACHED', 'message': t('errors.api_key_limit_reached')},
        )
    data = await api_key_service.create_key(db, uid, body.name)
    return {'success': True, 'data': data}


@router.delete('/{key_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[write_limiter])
async def delete_api_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete an API key."""
    deleted = await api_key_service.delete_key(db, UUID(user['id']), key_id)
    if not deleted:
        raise not_found_error(t('errors.api_key_not_found'))
