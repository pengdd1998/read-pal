"""Business logic for API key CRUD operations."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey, generate_api_key
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.api_keys')


def serialize_key(key: ApiKey, *, include_secret: bool = False) -> dict:
    """Convert an ApiKey ORM object to a response dict."""
    data = {
        'id': str(key.id),
        'name': key.name,
        'keyPrefix': key.key_prefix,
        'lastUsedAt': key.last_used_at.isoformat() if key.last_used_at else None,
        'createdAt': key.created_at.isoformat() if key.created_at else None,
    }
    if include_secret:
        data['key'] = None  # populated by caller
    return data


async def list_keys(db: AsyncSession, user_id: UUID) -> list[dict]:
    """Return all API keys for a user (prefixes only)."""
    async with db_error_guard('api_key_service.list_keys'):
        result = await db.execute(
            select(ApiKey).where(ApiKey.user_id == user_id),
        )
        keys = list(result.scalars().all())
    return [serialize_key(k) for k in keys]


async def create_key(db: AsyncSession, user_id: UUID, name: str) -> dict:
    """Generate and persist a new API key. Returns dict with the plain key (shown once)."""
    plain_key, key_hash, key_prefix = generate_api_key()
    now = datetime.now(tz=timezone.utc)

    api_key = ApiKey(
        user_id=user_id,
        name=name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        created_at=now,
        updated_at=now,
    )
    db.add(api_key)

    try:
        async with db_error_guard('api_key_service.create_key'):
            await db.flush()
    except IntegrityError:
        await db.rollback()
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={'code': 'DUPLICATE_KEY', 'message': 'API key already exists'},
        ) from None

    data = serialize_key(api_key)
    data['key'] = plain_key
    return data


async def delete_key(db: AsyncSession, user_id: UUID, key_id: UUID) -> bool:
    """Delete an API key. Returns False if not found."""
    async with db_error_guard('api_key_service.delete_key'):
        result = await db.execute(
            select(ApiKey).where(
                ApiKey.id == key_id,
                ApiKey.user_id == user_id,
            ),
        )
        key = result.scalar_one_or_none()
        if key is None:
            return False
        await db.execute(sa_delete(ApiKey).where(ApiKey.id == key_id))
    return True
