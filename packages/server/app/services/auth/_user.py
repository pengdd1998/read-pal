"""User CRUD — registration, profile lookup, password change, OAuth check."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.middleware.auth import create_token_pair, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserResponse
from app.utils.i18n import _get_user_lang, t

logger = logging.getLogger('read-pal.auth')

# Default settings applied to every new user
DEFAULT_USER_SETTINGS: dict = {
    'theme': 'system',
    'fontSize': 16,
    'fontFamily': 'Inter',
    'readingGoal': 2,
    'dailyReadingMinutes': 30,
    'notificationsEnabled': True,
}


def _build_user_data(user: User) -> dict:
    """Build a UserResponse dict from a User model instance."""
    user_data = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        settings=user.settings or {},
        created_at=user.created_at,
    )
    return user_data.model_dump(mode='json', by_alias=True)


async def check_google_oauth_configured() -> bool:
    """Return whether Google OAuth is configured."""
    settings = get_settings()
    return bool(getattr(settings, 'google_client_id', None))


async def _create_user_with_seed(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
) -> User:
    """Hash password, create user row, flush, and seed sample data."""
    password_hash = hash_password(password)

    user = User(
        email=email,
        name=name,
        password_hash=password_hash,
        settings=dict(DEFAULT_USER_SETTINGS),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    from app.services.seed_service import seed_sample_data
    await seed_sample_data(db, user.id)
    return user


def _raise_user_exists(email: str) -> None:
    """Raise HTTPException for duplicate email registration."""
    from fastapi import HTTPException, status

    logger.warning('Registration failed: email already exists %s', email)
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            'code': 'USER_EXISTS',
            'message': t('errors.user_exists'),
        },
    )


async def register_user(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
    platform: str,
) -> dict:
    """Create a new user account and return JWT.

    Returns auth response dict on success.
    Raises HTTPException if email already exists.
    """
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        _raise_user_exists(email)

    user = await _create_user_with_seed(db, email, name, password)

    access_token, refresh_token = create_token_pair(str(user.id), platform)
    logger.info('Registration success: %s (user_id=%s)', email, user.id)

    return {
        'user': _build_user_data(user),
        'token': access_token,
        'refreshToken': refresh_token,
    }


async def get_user_profile(db: AsyncSession, user_id: str) -> dict:
    """Return the authenticated user's profile dict.

    Raises HTTPException if user not found.
    """
    from fastapi import HTTPException, status

    lang = await _get_user_lang(db, UUID(user_id))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found', lang)},
        )

    return {
        'id': str(user.id),
        'email': user.email,
        'name': user.name,
        'avatar': user.avatar,
        'settings': user.settings,
        'createdAt': user.created_at.isoformat() if user.created_at else None,
    }


async def change_user_password(
    db: AsyncSession,
    user_id: str,
    current_password: str,
    new_password: str,
) -> str:
    """Change password for an authenticated user.

    Returns success message.
    Raises HTTPException if user not found or current password is wrong.
    """
    from fastapi import HTTPException, status

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    lang = await _get_user_lang(db, UUID(user_id))

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found', lang)},
        )

    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={'code': 'INVALID_PASSWORD', 'message': t('errors.invalid_password', lang)},
        )

    user.password_hash = hash_password(new_password)
    await db.flush()

    return t('errors.password_changed', lang)
