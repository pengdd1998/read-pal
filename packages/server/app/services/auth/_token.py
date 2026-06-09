"""Token operations — revocation, decoding, and refresh."""

import logging

from jose import JWTError, jwt as jose_jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.middleware.auth import create_token_pair, revoke_token
from app.models.user import User
from app.utils.i18n import t

logger = logging.getLogger('read-pal.auth')


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
    except (JWTError, KeyError, ValueError) as exc:
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
    except (JWTError, KeyError, ValueError) as exc:
        logger.warning('Logout refresh token revocation skipped: %s', exc)


def _decode_refresh_token(refresh_token: str) -> dict:
    """Decode and validate a refresh JWT, returning payload or raising."""
    from fastapi import HTTPException, status

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

    if payload.get('type') != 'refresh':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'INVALID_TOKEN',
                'message': t('errors.not_refresh_token'),
            },
        )

    return payload


async def _validate_refresh_payload(db: AsyncSession, payload: dict) -> User:
    """Check revocation and user existence for a refresh token payload."""
    from fastapi import HTTPException, status

    from app.middleware.auth import is_token_revoked

    jti = payload.get('jti')
    if jti and await is_token_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                'code': 'TOKEN_REVOKED',
                'message': t('errors.refresh_token_revoked'),
            },
        )

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

    return user


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> dict:
    """Exchange a valid refresh token for a new token pair."""
    payload = _decode_refresh_token(refresh_token)
    user = await _validate_refresh_payload(db, payload)

    # Revoke the old refresh token (rotation)
    jti = payload.get('jti')
    exp = payload.get('exp')
    if jti and exp:
        await revoke_token(jti, exp)

    access_token, new_refresh_token = create_token_pair(str(user.id))
    return {
        'token': access_token,
        'refreshToken': new_refresh_token,
    }
