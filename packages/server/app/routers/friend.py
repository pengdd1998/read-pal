"""Friend routes — personality-based reading friend chat and relationship info."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.agent import ChatResponse, FriendChatRequest
from app.services import friend_service
from app.utils.i18n import t

logger = logging.getLogger('read-pal.friend')

router = APIRouter(prefix='/api/v1/friend', tags=['friend'])


@router.post('/chat', response_model=ChatResponse)
async def chat(
    body: FriendChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Reading friend chat endpoint with persona selection."""
    try:
        result = await friend_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            persona=body.persona,
            message=body.message,
            book_id=body.book_id,
        )
    except Exception as exc:
        logger.exception('Friend chat error')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                'code': 'INTERNAL_ERROR',
                'message': t('errors.friend_response_failed'),
            },
        ) from exc

    return ChatResponse(data=result)


@router.get('/relationship')
async def get_relationship(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the friend relationship info for the current user."""
    result = await friend_service.get_relationship(
        db=db,
        user_id=current_user['id'],
    )
    return {'success': True, 'data': result}
