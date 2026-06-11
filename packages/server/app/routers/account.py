"""Account management routes — profile updates and account deletion."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import account_limiter
from app.schemas.auth import DeleteAccountRequest, UpdateProfileRequest
from app.schemas.common import GenericResponse
from app.services import account_service
from app.utils.i18n import not_found_error, t
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.account')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'], dependencies=[api_limiter])


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.patch('/me', response_model=GenericResponse)
async def update_me(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the authenticated user's profile."""
    try:
        profile = await account_service.update_profile(
            db,
            current_user['id'],
            name=body.name,
            avatar=body.avatar,
            settings=body.settings,
        )
    except ValueError:
        logger.debug('validation error in account')
        raise not_found_error(t('errors.user_not_found'))
    return {'success': True, 'data': profile}


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account
# ---------------------------------------------------------------------------

@router.delete('/account', status_code=status.HTTP_204_NO_CONTENT, dependencies=[account_limiter])
async def delete_account(
    body: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete user account and all cascading data. Requires password confirmation."""
    try:
        await account_service.delete_account(
            db,
            current_user['id'],
            body.password,
            access_token=current_user.get('token'),
            refresh_token=body.refresh_token,
        )
    except ValueError as e:
        logger.debug('validation error in account')
        msg = str(e)
        code = 'WRONG_PASSWORD' if msg == 'wrong_password' else 'UNAUTHORIZED'
        status_code = status.HTTP_403_FORBIDDEN if code == 'WRONG_PASSWORD' else status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=status_code,
            detail={'code': code, 'message': t('errors.unauthorized')},
        )
