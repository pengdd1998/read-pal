"""Friend routes — personality-based reading friend chat and relationship info."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.idempotency import idempotent
from app.middleware.rate_limiter import chat_limiter, write_limiter
from app.middleware.daily_llm_budget import daily_ai_budget
from app.schemas.agent import ChatResponse, FriendChatRequest
from app.schemas.common import GenericResponse
from app.services import friend_service
from app.utils.i18n import t
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.friend')

router = APIRouter(prefix='/api/v1/friend', tags=['friend'], dependencies=[api_limiter])


@router.post('/chat', response_model=ChatResponse, dependencies=[chat_limiter, write_limiter, daily_ai_budget, idempotent])
async def chat(
    request: Request,  # populated by idempotent dependency
    body: FriendChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Reading friend chat endpoint with persona selection."""
    from app.middleware.idempotency import check_idempotency_cache, store_idempotency_response
    cached = await check_idempotency_cache(request)
    if cached is not None:
        return ChatResponse(data=cached.get('data'))
    try:
        result = await friend_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            persona=body.persona,
            message=body.message,
            book_id=body.book_id,
        )
    except TimeoutError as exc:
        logger.warning('Friend chat timeout')
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                'code': 'TIMEOUT',
                'message': t('errors.llm_timeout'),
            },
        ) from exc
    except ValueError as exc:
        logger.warning('Friend chat validation error: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                'code': 'VALIDATION_ERROR',
                'message': t('errors.validation_failed'),
            },
        ) from exc
    except (ConnectionError, TimeoutError) as exc:
        logger.exception('Friend chat connection error')
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                'code': 'AI_UNAVAILABLE',
                'message': t('errors.ai_unavailable'),
            },
        ) from exc

    await store_idempotency_response(request, {'data': result})
    return ChatResponse(data=result)


@router.get('/relationship', response_model=GenericResponse)
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


@router.get('/recommend-persona', response_model=GenericResponse)
async def recommend_persona(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recommend a persona based on the user's reading behavior."""
    result = await friend_service.recommend_persona(
        db=db,
        user_id=UUID(current_user['id']),
    )
    return {'success': True, 'data': result}
