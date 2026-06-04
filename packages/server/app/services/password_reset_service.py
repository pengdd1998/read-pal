"""Password reset business logic — token generation, validation, email dispatch."""

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.middleware.auth import hash_password
from app.models.user import User

logger = logging.getLogger('read-pal.password_reset')

_TOKEN_PREFIX = 'password-reset:'
_TOKEN_TTL = 3600  # 1 hour


async def create_reset_token(db: AsyncSession, email: str) -> str | None:
    """Generate a password reset token for the given email.

    Returns the token if user exists, None otherwise.
    Token is stored in Redis with a 1-hour TTL.
    """
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    token = str(uuid.uuid4())
    redis = get_redis()
    await redis.set(
        f'{_TOKEN_PREFIX}{token}',
        json.dumps({'userId': str(user.id), 'email': user.email}),
        ex=_TOKEN_TTL,
    )
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
    except Exception:
        logger.warning(
            'Password reset email delivery failed for %s — '
            'user will not receive the reset link',
            email,
            exc_info=True,
        )
        return False


async def validate_and_reset(
    db: AsyncSession,
    token: str,
    new_password: str,
) -> User:
    """Validate a reset token and update the user's password.

    Raises ValueError if token is invalid or user not found.
    """
    redis = get_redis()
    data = await redis.get(f'{_TOKEN_PREFIX}{token}')
    if not data:
        raise ValueError('Invalid or expired reset token')

    payload = json.loads(data)
    user_id = payload['userId']

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError('User not found')

    user.password_hash = hash_password(new_password)
    await db.commit()

    # Consume token
    await redis.delete(f'{_TOKEN_PREFIX}{token}')
    logger.info('Password reset successful for user %s', user_id)
    return user
