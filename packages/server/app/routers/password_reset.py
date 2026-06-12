"""Password reset routes — forgot-password and reset-password endpoints.

Tokens are stored in Redis with a 1-hour TTL.
Always returns success on forgot-password to prevent email enumeration.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.rate_limiter import password_reset_limiter, write_limiter
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
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.password_reset')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'], dependencies=[api_limiter])


@router.post('/forgot-password', response_model=MessageResponse, dependencies=[password_reset_limiter, write_limiter])
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Generate a password reset token stored in Redis (1hr TTL).

    Always returns success to prevent email enumeration.
    """
    try:
        token = await create_reset_token(db, body.email)
        if token:
            delivered = await send_reset_email(body.email, token)
            if not delivered:
                logger.warning(
                    'Forgot-password: email delivery failed for %s — '
                    'token created but user will not receive reset link',
                    body.email,
                )
    except (ValueError, RuntimeError, OSError) as exc:
        logger.warning(
            'Error in forgot-password flow for %s',
            body.email,
            exc_info=True,
        )

    return MessageResponse(
        data={'message': t('errors.reset_link_sent')},
    )


@router.post('/reset-password', response_model=MessageResponse, dependencies=[password_reset_limiter, write_limiter])
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Validate reset token and update the user's password."""
    try:
        await validate_and_reset(db, body.token, body.password)
    except ValueError as exc:
        logger.debug('validation error in password_reset')
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
