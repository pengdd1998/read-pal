"""Password reset routes — forgot-password and reset-password endpoints.

Tokens are stored in Redis with a 1-hour TTL.
Always returns success on forgot-password to prevent email enumeration.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.db import get_db
from app.middleware.rate_limiter import password_reset_limiter
from app.schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
)
from app.services.password_reset_service import (
    create_reset_token,
    send_reset_email,
    validate_and_reset,
)
from app.utils.i18n import t

logger = logging.getLogger('read-pal.password_reset')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


@router.post('/forgot-password', dependencies=[password_reset_limiter])
async def forgot_password(body: ForgotPasswordRequest) -> MessageResponse:
    """Generate a password reset token stored in Redis (1hr TTL).

    Always returns success to prevent email enumeration.
    """
    try:
        from app.db import async_session

        async with async_session() as db:
            token = await create_reset_token(db, body.email)

        if token:
            await send_reset_email(body.email, token)
    except Exception:
        logger.warning('Error during forgot-password flow', exc_info=True)

    return MessageResponse(
        data={'message': t('errors.reset_link_sent')},
    )


@router.post('/reset-password', dependencies=[password_reset_limiter])
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    """Validate reset token and update the user's password."""
    from app.db import async_session

    try:
        async with async_session() as db:
            await validate_and_reset(db, body.token, body.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                'code': 'INVALID_TOKEN',
                'message': t('errors.reset_token_invalid'),
            },
        ) from exc

    return MessageResponse(
        data={'message': t('errors.password_reset_success')},
    )
