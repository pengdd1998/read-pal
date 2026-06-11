"""Login flow — account lockout, credential verification, authentication."""

import logging

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import create_token_pair, verify_password
from app.middleware.login_lockout import get_login_lockout
from app.models.user import User
from app.schemas.auth import UserResponse
from app.utils.i18n import _get_user_lang, t

logger = logging.getLogger('read-pal.auth')


async def _check_account_lockout(email: str) -> None:
    """Raise HTTPException if the account is locked out."""
    from fastapi import HTTPException, status

    lockout = get_login_lockout()
    is_locked, minutes_remaining = await lockout.check_lockout(email)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'code': 'ACCOUNT_LOCKED',
                'message': t('errors.account_locked', minutes=minutes_remaining),
            },
        )


async def _find_user_by_email(db: AsyncSession, email: str) -> User:
    """Look up a user by email. Raises 401 if not found or no password."""
    from fastapi import HTTPException, status

    try:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.error('_login._find_user_by_email DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc

    if user is None or user.password_hash is None:
        logger.warning('Login failed: unknown email %s', email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_CREDENTIALS',
                'message': t('errors.invalid_credentials'),
            },
        )

    return user


async def _verify_login_password(
    email: str,
    password: str,
    user: User,
    lang: str,
) -> None:
    """Raise HTTPException if the password is wrong."""
    from fastapi import HTTPException, status

    if verify_password(password, user.password_hash):
        return

    lockout = get_login_lockout()
    await lockout.record_failed_login(email)
    logger.warning(
        'Login failed: wrong password for %s (user_id=%s)', email, user.id,
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            'code': 'INVALID_CREDENTIALS',
            'message': t('errors.invalid_credentials', lang),
        },
    )


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


def _build_auth_response(user: User, access_token: str, refresh_token: str) -> dict:
    """Build the standard auth response with user + tokens."""
    return {
        'user': _build_user_data(user),
        'token': access_token,
        'refreshToken': refresh_token,
    }


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
    await _check_account_lockout(email)
    user = await _find_user_by_email(db, email)
    lang = await _get_user_lang(db, user.id)
    await _verify_login_password(email, password, user, lang)

    # Success — generate token pair and clear lockout counter
    access_token, refresh_token = create_token_pair(str(user.id), platform)
    lockout = get_login_lockout()
    await lockout.clear_failed_logins(email)
    logger.info(
        'Login success: %s (user_id=%s, platform=%s)', email, user.id, platform,
    )

    return _build_auth_response(user, access_token, refresh_token)
