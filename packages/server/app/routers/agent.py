"""Agent routes — reading companion chat, streaming, summarization, explanation, plans, feedback."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter, chat_limiter, stream_limiter
from app.schemas.agent import (
    AdvancePlanRequest,
    AIFeedbackRequest,
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    MoodSceneRequest,
    ReadingPlanRequest,
    ReadingPlanResponse,
    SummarizeRequest,
)
from app.schemas.common import GenericResponse
from app.services import companion_service
from app.services.agent_service import raise_not_found, resolve_lang, sse_bytes_stream
from app.services.chat_service import get_chat_history
from app.services.feedback_service import submit_feedback as submit_feedback_svc
from app.services.mood_service import generate_mood_scene
from app.services.reading_plan_service import advance_plan, generate_plan, get_active_plan
from app.utils.i18n import t

logger = logging.getLogger('read-pal.agent')

router = APIRouter(prefix='/api/v1/agent', tags=['agent'])

_SSE_HEADERS = {
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
}


@router.get('/health')
async def llm_health() -> dict:
    """Public health check for the LLM service (no auth required)."""
    from app.services.llm import check_llm_health

    try:
        return await check_llm_health()
    except Exception as exc:
        logger.error('Health check failed: %s', exc)
        return {'healthy': False, 'error': str(exc)}


@router.post('/chat', response_model=ChatResponse, dependencies=[chat_limiter])
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Reading companion chat endpoint."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    try:
        result = await companion_service.chat(
            db=db, user_id=uid, book_id=body.book_id,
            message=body.message, context=body.context,
            persona=body.persona, lang=lang,
        )
    except ValueError as exc:
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.post('/stream', dependencies=[stream_limiter])
@router.post('/chat/stream', dependencies=[stream_limiter])
async def stream(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Streaming reading companion chat (SSE)."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    companion_mode = body.context.get('companionMode', 'casual') if body.context else 'casual'
    persona = (body.context.get('persona') if body.context else None) or body.persona
    return StreamingResponse(
        sse_bytes_stream(
            db, uid, body.book_id, body.message,
            context=body.context, companion_mode=companion_mode,
            persona=persona, lang=lang,
        ),
        media_type='text/event-stream',
        headers=_SSE_HEADERS,
    )


@router.post('/summarize', response_model=ChatResponse, dependencies=[ai_heavy_limiter])
async def summarize(
    body: SummarizeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Summarize a book or specific chapters."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    try:
        result = await companion_service.summarize(
            db=db, user_id=uid, book_id=body.book_id,
            chapter_ids=body.chapter_ids, lang=lang,
        )
    except ValueError as exc:
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.post('/explain', response_model=ChatResponse, dependencies=[ai_heavy_limiter])
async def explain(
    body: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Explain a passage from a book."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    try:
        result = await companion_service.explain(
            db=db, user_id=uid, book_id=body.book_id,
            text=body.text, context=body.context, lang=lang,
        )
    except ValueError as exc:
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.get('/history', response_model=GenericResponse)
async def get_chat_history_endpoint(
    book_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get chat history for a user, optionally filtered by book."""
    messages = await get_chat_history(
        db, UUID(current_user['id']), book_id=book_id, limit=limit,
    )
    return {'success': True, 'data': messages}


@router.post('/discussion-questions', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def discussion_questions(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate discussion questions for a book."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    try:
        result = await companion_service.chat(
            db=db, user_id=uid, book_id=body.book_id,
            message=body.message or 'Generate discussion questions for this book',
            context=body.context, persona=body.persona, lang=lang,
        )
    except ValueError as exc:
        raise_not_found(exc, lang)
    return {'success': True, 'data': result}


@router.post('/mood/scene', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def mood_scene(
    body: MoodSceneRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a mood-based scene description using the LLM."""
    lang = await resolve_lang(db, UUID(current_user['id']))
    data = await generate_mood_scene(
        db, UUID(current_user['id']),
        mood=body.mood, text=body.text, lang=lang,
    )
    return {'success': True, 'data': data}


@router.post('/feedback', response_model=GenericResponse)
async def submit_feedback(
    body: AIFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit feedback (thumbs up/down) for an AI response."""
    data = await submit_feedback_svc(
        db, UUID(current_user['id']),
        book_id=body.book_id, message_id=body.message_id,
        rating=body.rating, comment=body.comment,
    )
    return {'success': True, 'data': data}


@router.post('/reading-plan', response_model=ReadingPlanResponse, dependencies=[ai_heavy_limiter])
async def create_reading_plan(
    body: ReadingPlanRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingPlanResponse:
    """Generate an AI reading plan for a book."""
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    try:
        result = await generate_plan(
            db=db, user_id=uid, book_id=body.book_id,
            total_days=body.total_days, daily_minutes=body.daily_minutes,
        )
    except ValueError as exc:
        raise_not_found(exc, lang)
    except Exception as exc:
        logger.error('Reading plan generation failed: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_unavailable', lang)},
        ) from exc
    return ReadingPlanResponse(data=result)


@router.get('/reading-plan', response_model=GenericResponse)
async def get_reading_plan(
    book_id: UUID = Query(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the active reading plan for a book."""
    result = await get_active_plan(
        db=db, user_id=UUID(current_user['id']), book_id=book_id,
    )
    return {'success': True, 'data': result}


@router.post('/reading-plan/advance', response_model=GenericResponse)
async def advance_reading_plan(
    body: AdvancePlanRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Advance reading plan to the next day."""
    lang = await resolve_lang(db, UUID(current_user['id']))
    result = await advance_plan(
        db=db, user_id=UUID(current_user['id']), book_id=body.book_id,
    )
    if not result:
        return {'success': True, 'data': None, 'message': t('errors.no_active_plan', lang)}
    return {'success': True, 'data': result}
