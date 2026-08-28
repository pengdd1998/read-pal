"""Password reset business logic — token generation, validation, email dispatch."""

import json
import logging
import secrets
import smtplib
from datetime import datetime, UTC

import redis.exceptions
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.middleware.auth import hash_password
from app.models.user import User
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.password_reset')

_TOKEN_PREFIX = 'password-reset:'
_TOKEN_TTL = 3600  # 1 hour


async def create_reset_token(db: AsyncSession, email: str) -> str | None:
    """Generate a password reset token for the given email.

    Returns the token if user exists, None otherwise.
    Token is stored in Redis with a 1-hour TTL.
    """
    async with db_error_guard('create_reset_token', email=email):
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
    if user is None:
        return None

    # 256-bit entropy via secrets (CSPRNG) — uuid4 is only 122 bits and comes
    # from a weaker generator. URL-safe so it survives query-string transport
    # in the reset link unchanged.
    token = secrets.token_urlsafe(32)
    try:
        redis_client = get_redis()
        await redis_client.set(
            f'{_TOKEN_PREFIX}{token}',
            json.dumps({'userId': str(user.id), 'email': user.email}),
            ex=_TOKEN_TTL,
        )
    except redis.exceptions.RedisError as exc:
        logger.error('password_reset.redis_set_failed email=%s error=%s', email, exc)
        raise RuntimeError('Service temporarily unavailable') from exc
    logger.info('Password reset requested for %s', email)
    return token


async def send_reset_email(email: str, token: str) -> bool:
    """Dispatch the password reset email.

    Returns True if the email was dispatched (or logged to console in dev),
    False if SMTP delivery failed.  The caller should still return HTTP 200
    to prevent email enumeration, but can use the return value for logging.
    """
    try:
        from app.services.email_service import send_password_reset_email
        await send_password_reset_email(email, token)
        return True
    except (smtplib.SMTPException, TimeoutError, ConnectionError, OSError):
        logger.warning(
            'Password reset email delivery failed for %s — '
            'user will not receive the reset link',
            email,
            exc_info=True,
        )
        return False


async def _validate_reset_token(token: str) -> dict:
    """Atomically consume a reset token and return its payload.

    Uses Redis GETDEL so the token is consumed in the same step as the
    read — closes a TOCTOU race where two concurrent reset requests
    both validated the same token before either deleted it, then both
    proceeded to set different passwords (last writer wins, attacker
    wins if their request lands last).

    Raises ValueError if token is missing or payload is malformed.
    Raises RuntimeError if Redis is unavailable.
    """
    try:
        redis_client = get_redis()
        data = await redis_client.getdel(f'{_TOKEN_PREFIX}{token}')
    except redis.exceptions.RedisError as exc:
        logger.error('password_reset.redis_getdel_failed error=%s', exc)
        raise RuntimeError('Service temporarily unavailable') from exc

    if not data:
        raise ValueError('Invalid or expired reset token')

    payload = json.loads(data)
    user_id = payload.get('userId')
    if not user_id:
        raise ValueError('Invalid reset token payload')

    return payload


async def _update_user_password(
    db: AsyncSession,
    user_id: str,
    new_password: str,
) -> User:
    """Update the user's password hash in the database.

    Raises ValueError if user is not found.
    """
    async with db_error_guard('_update_user_password', user_id=user_id):
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
    if user is None:
        raise ValueError('User not found')

    user.password_hash = hash_password(new_password)
    async with db_error_guard('_update_user_password.commit', user_id=user_id):
        await db.commit()
    return user


async def _invalidate_sessions(user_id: str) -> None:
    """Invalidate all active sessions for the user.

    The marker value is the reset timestamp in unix epoch seconds —
    auth._was_password_reset compares it against each token's ``iat`` so only
    tokens issued BEFORE the reset are rejected. Must stay a numeric string
    for that comparison to work.

    The reset token itself is already consumed atomically by
    _validate_reset_token's GETDEL, so we no longer need a separate
    DEL call here.
    """
    try:
        redis_client = get_redis()
        await redis_client.set(
            f'pwd-reset:{user_id}',
            str(int(datetime.now(UTC).timestamp())),
            ex=86400 * 30,  # 30 days — longer than any token TTL
        )
    except redis.exceptions.RedisError as exc:
        logger.warning('password_reset.invalidate_sessions_failed user=%s error=%s', user_id, exc)


async def validate_and_reset(
    db: AsyncSession,
    token: str,
    new_password: str,
) -> User:
    """Validate a reset token and update the user's password.

    Raises ValueError if token is invalid or user not found.
    Raises RuntimeError if Redis is unavailable.
    """
    payload = await _validate_reset_token(token)
    user_id = payload['userId']

    user = await _update_user_password(db, user_id, new_password)
    await _invalidate_sessions(user_id)

    logger.info('Password reset successful for user %s', user_id)
    return user
