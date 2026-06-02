"""Business logic for account management: profile updates and deletion."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger('read-pal.account')


async def update_profile(
    db: AsyncSession,
    user_id: UUID,
    name: str | None,
    avatar: str | None,
    settings: dict | None,
) -> dict:
    """Update the user's profile fields and return the updated profile."""
    user = await _get_user(db, user_id)

    if name is not None:
        user.name = name
    if avatar is not None:
        user.avatar = avatar
    if settings is not None:
        user.settings = {**(user.settings or {}), **settings}

    await db.flush()

    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'avatar': user.avatar,
        'settings': user.settings,
    }


async def delete_account(db: AsyncSession, user_id: UUID) -> None:
    """Delete the user account and all cascading data."""
    user = await _get_user(db, user_id)
    await db.delete(user)
    await db.flush()
    logger.info('Account deleted: %s', user_id)


async def _get_user(db: AsyncSession, user_id: UUID) -> User:
    """Fetch user or raise ValueError."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError('user_not_found')
    return user
