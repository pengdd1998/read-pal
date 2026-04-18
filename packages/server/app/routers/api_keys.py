"""API key routes — CRUD for personal access tokens."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.api_key import ApiKey, generate_api_key

router = APIRouter(prefix='/api/v1/api-keys', tags=['api-keys'])


def _serialize_key(key: ApiKey, include_secret: bool = False) -> dict:
    """Convert an ApiKey ORM object to a response dict."""
    data = {
        'id': str(key.id),
        'name': key.name,
        'key_prefix': key.key_prefix,
        'last_used_at': key.last_used_at.isoformat() if key.last_used_at else None,
        'created_at': key.created_at.isoformat() if key.created_at else None,
    }
    if include_secret:
        data['key'] = None  # populated by caller
    return data


@router.get('/')
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """List user's API keys (prefixes only, never full keys)."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == UUID(user['id'])),
    )
    keys = list(result.scalars().all())
    return {
        'success': True,
        'data': [_serialize_key(k) for k in keys],
    }


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a new API key.

    Body: ``{"name": "My Key"}``
    """
    name = body.get('name', 'API Key')
    plain_key, key_hash, key_prefix = generate_api_key()

    api_key = ApiKey(
        user_id=UUID(user['id']),
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
    )
    db.add(api_key)
    await db.flush()

    data = _serialize_key(api_key)
    data['key'] = plain_key  # only shown once at creation
    return {'success': True, 'data': data}


@router.delete('/{key_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> None:
    """Delete an API key."""
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.user_id == UUID(user['id']),
        ),
    )
    key = result.scalar_one_or_none()
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'API key not found'},
        )
    await db.execute(
        sa_delete(ApiKey).where(ApiKey.id == key_id),
    )
