"""Password reset business logic — token generation, validation, email dispatch."""

import json
import logging
import smtplib
import uuid

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

    token = str(uuid.uuid4())
    try:
        redis = get_redis()
        await redis.set(
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
    except (smtplib.SMTPException, TimeoutError, ConnectionError, OSError) as exc:
        logger.warning(
            'Password reset email delivery failed for %s — '
            'user will not receive the reset link',
            email,
            exc_info=True,
        )
        return False


async def _validate_reset_token(token: str) -> dict:
    """Look up a reset token in Redis and return its payload.

    Raises ValueError if token is missing or payload is malformed.
    Raises RuntimeError if Redis is unavailable.
    """
    try:
        redis = get_redis()
        data = await redis.get(f'{_TOKEN_PREFIX}{token}')
    except redis.exceptions.RedisError as exc:
        logger.error('password_reset.redis_get_failed error=%s', exc)
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


async def _invalidate_sessions(token: str, user_id: str) -> None:
    """Invalidate all active sessions and consume the reset token."""
    try:
        redis = get_redis()
        await redis.set(
            f'pwd-reset:{user_id}',
            str(uuid.uuid4()),
            ex=86400 * 30,  # 30 days — longer than any token TTL
        )
    except redis.exceptions.RedisError as exc:
        logger.warning('password_reset.invalidate_sessions_failed user=%s error=%s', user_id, exc)

    try:
        redis = get_redis()
        await redis.delete(f'{_TOKEN_PREFIX}{token}')
    except redis.exceptions.RedisError as exc:
        logger.warning('password_reset.redis_delete_failed user=%s error=%s', user_id, exc)


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
    await _invalidate_sessions(token, user_id)

    logger.info('Password reset successful for user %s', user_id)
    return user
