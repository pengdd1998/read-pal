"""Account management routes — profile updates and account deletion."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import account_limiter
from app.models.user import User
from app.schemas.auth import MessageResponse, UpdateProfileRequest

logger = logging.getLogger('read-pal.account')

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/me
# ---------------------------------------------------------------------------

@router.patch('/me')
async def update_me(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update the authenticated user's profile."""
    result = await db.execute(
        select(User).where(User.id == current_user['id']),
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'User not found'},
        )

    if body.name is not None:
        user.name = body.name
    if body.avatar is not None:
        user.avatar = body.avatar
    if body.settings is not None:
        user.settings = {**(user.settings or {}), **body.settings}

    await db.flush()

    return {
        'success': True,
        'data': {
            'id': str(user.id),
            'email': user.email,
            'name': user.name,
            'avatar': user.avatar,
            'settings': user.settings,
        },
    }


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/account
# ---------------------------------------------------------------------------

@router.delete('/account', dependencies=[account_limiter])
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete user account and all cascading data."""
    user_id = current_user['id']

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={'code': 'UNAUTHORIZED', 'message': 'Not authenticated'},
        )

    await db.delete(user)
    await db.flush()

    logger.info('Account deleted: %s', user_id)

    return MessageResponse(data={'message': 'Account deleted successfully'})
