"""Account management routes — profile updates and account deletion."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import account_limiter
from app.schemas.auth import UpdateProfileRequest
from app.schemas.common import GenericResponse
from app.services import account_service
from app.utils.i18n import t

logger = logging.getLogger('read-pal.account')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.user_not_found')},
        )
    return {'success': True, 'data': profile}


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account
# ---------------------------------------------------------------------------

@router.delete('/account', status_code=status.HTTP_204_NO_CONTENT, dependencies=[account_limiter])
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete user account and all cascading data."""
    try:
        await account_service.delete_account(db, current_user['id'])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'UNAUTHORIZED', 'message': t('errors.unauthorized')},
        )
