"""Auth service — business logic for authentication.

Handles user lookup, password verification, token management,
and user registration. All database and crypto operations live here.
"""

import logging
from uuid import UUID

from jose import JWTError, jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.middleware.auth import (
    create_token_pair,
    hash_password,
    revoke_token,
    verify_password,
)
from app.middleware.login_lockout import get_login_lockout
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
    return user_data.model_dump(mode='json')


def _build_auth_response(user: User, access_token: str, refresh_token: str) -> dict:
    """Build the standard auth response with user + tokens."""
    return {
        'user': _build_user_data(user),
        'token': access_token,
        'refreshToken': refresh_token,
    }


async def check_google_oauth_configured() -> bool:
    """Return whether Google OAuth is configured."""
    settings = get_settings()
    return bool(getattr(settings, 'google_client_id', None))


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
    platform: str,
) -> dict:
    """Authenticate a user by email and password.

    Returns auth response dict on success.
    Raises HTTPException on lockout, invalid credentials, etc.
    """
    from fastapi import HTTPException, status

    lockout = get_login_lockout()

    # Check account lockout
    is_locked, minutes_remaining = await lockout.check_lockout(email)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'code': 'ACCOUNT_LOCKED',
                'message': t('errors.account_locked', minutes=minutes_remaining),
            },
        )

    # Find user by email
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': t('errors.invalid_credentials'),
            },
        )

    # Get user language preference for error messages
    lang = await _get_user_lang(db, user.id)

    # Verify password
    if not verify_password(password, user.password_hash):
        await lockout.record_failed_login(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': t('errors.invalid_credentials', lang),
            },
        )

    # Success — generate token pair and clear lockout counter
    access_token, refresh_token = create_token_pair(str(user.id), platform)
    await lockout.clear_failed_logins(email)

    return _build_auth_response(user, access_token, refresh_token)


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
    from fastapi import HTTPException, status

    # Check if user already exists
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'USER_EXISTS',
                'message': t('errors.user_exists'),
            },
        )

    # Hash password and create user
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

    # Auto-seed a sample book so new users see content immediately
    from app.services.seed_service import seed_sample_data
    await seed_sample_data(db, user.id)

    access_token, refresh_token = create_token_pair(str(user.id), platform)
    return _build_auth_response(user, access_token, refresh_token)


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


async def revoke_access_token(token: str) -> None:
    """Decode and revoke an access token (best-effort)."""
    try:
        settings = get_settings()
        decoded = jose_jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=['HS256'],
        )
        jti = decoded.get('jti')
        exp = decoded.get('exp')
        if jti and exp:
            await revoke_token(jti, exp)
    except Exception as exc:
        logger.warning('Logout access token revocation skipped: %s', exc)


async def revoke_refresh_token(refresh_token: str) -> None:
    """Decode and revoke a refresh token (best-effort)."""
    try:
        settings = get_settings()
        decoded = jose_jwt.decode(
            refresh_token,
            settings.jwt_secret,
            algorithms=['HS256'],
        )
        jti = decoded.get('jti')
        exp = decoded.get('exp')
        if jti and exp:
            await revoke_token(jti, exp)
    except Exception as exc:
        logger.warning('Logout refresh token revocation skipped: %s', exc)


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> dict:
    """Exchange a valid refresh token for a new token pair.

    Validates token type, revocation status, and user existence.
    Revokes the old refresh token (rotation).
    Returns new token pair dict.
    """
    from fastapi import HTTPException, status
    from app.middleware.auth import is_token_revoked

    settings = get_settings()

    try:
        payload = jose_jwt.decode(
            refresh_token,
            settings.jwt_secret,
            algorithms=['HS256'],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': t('errors.invalid_refresh_token'),
            },
        ) from exc

    # Validate token type
    if payload.get('type') != 'refresh':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': t('errors.not_refresh_token'),
            },
        )

    # Check revocation
    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'TOKEN_REVOKED',
                'message': t('errors.refresh_token_revoked'),
            },
        )

    # Verify user still exists
    user_id = payload.get('userId') or payload.get('sub') or ''
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'USER_NOT_FOUND',
                'message': t('errors.user_account_not_found'),
            },
        )

    # Revoke the old refresh token (rotation)
    exp = payload.get('exp')
    if jti and exp:
        await revoke_token(jti, exp)

    # Issue new token pair
    access_token, new_refresh_token = create_token_pair(str(user.id))

    return {
        'token': access_token,
        'refreshToken': new_refresh_token,
    }
