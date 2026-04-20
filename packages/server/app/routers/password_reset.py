"""Password reset routes — forgot-password and reset-password endpoints.

Tokens are stored in Redis with a 1-hour TTL.
Always returns success on forgot-password to prevent email enumeration.
"""

import json
import logging
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.middleware.auth import hash_password
from app.middleware.rate_limiter import password_reset_limiter
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
)
from app.utils.i18n import t

logger = logging.getLogger('read-pal.password_reset')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])

# --- Redis client for password reset tokens ----------------------------------

_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
    return _redis_client


# ---------------------------------------------------------------------------
# POST /api/v1/auth/forgot-password
# ---------------------------------------------------------------------------

@router.post('/forgot-password', dependencies=[password_reset_limiter])
async def forgot_password(body: ForgotPasswordRequest) -> MessageResponse:
    """Generate a password reset token stored in Redis (1hr TTL).

    Always returns success to prevent email enumeration.
    """
    try:
        r = _get_redis()

        # Check if user exists (silently ignore if not)
        from app.db import async_session

        async with async_session() as db:
            result = await db.execute(
                select(User).where(User.email == body.email),
            )
            user = result.scalar_one_or_none()

        if user is not None:
            reset_token = str(uuid.uuid4())
            await r.set(
                f'password-reset:{reset_token}',
                json.dumps({'userId': str(user.id), 'email': user.email}),
                ex=3600,  # 1 hour
            )
            logger.info('Password reset requested for %s', body.email)

            from app.services.email_service import send_password_reset_email
            await send_password_reset_email(body.email, reset_token)

    except Exception:
        # Silently ignore errors to prevent enumeration
        logger.debug('Error during forgot-password flow', exc_info=True)

    return MessageResponse(
        data={'message': t('errors.reset_link_sent')},
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password
# ---------------------------------------------------------------------------

@router.post('/reset-password', dependencies=[password_reset_limiter])
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    """Validate reset token and update the user's password."""
    r = _get_redis()
    data = await r.get(f'password-reset:{body.token}')

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_TOKEN',
                'message': t('errors.reset_token_invalid'),
            },
        )

    payload = json.loads(data)
    user_id = payload['userId']

    from app.db import async_session

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    'code': 'INVALID_TOKEN',
                    'message': t('errors.reset_token_invalid'),
                },
            )

        user.password_hash = hash_password(body.password)
        await db.commit()

    # Consume the token so it cannot be reused
    await r.delete(f'password-reset:{body.token}')

    logger.info('Password reset successful')

    return MessageResponse(
        data={'message': t('errors.password_reset_success')},
    )
