"""Agent routes — reading companion chat, streaming, summarization, explanation, plans, feedback."""

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter, chat_limiter, stream_limiter
from app.models.chat_message import ChatMessage
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
from app.utils.i18n import DEFAULT_LANGUAGE, _get_user_lang, t

logger = logging.getLogger('read-pal.agent')

router = APIRouter(prefix='/api/v1/agent', tags=['agent'])


@router.get('/health')
async def llm_health() -> dict:
    """Public health check for the LLM service (no auth required)."""
    try:
        from app.services.llm import check_llm_health
        return await check_llm_health()
    except Exception as exc:
        logger.error('Health check failed: %s', exc)
        return {'healthy': False, 'error': str(exc)}


async def _sse_stream(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    lang: str = DEFAULT_LANGUAGE,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator."""
    try:
        async for chunk in companion_service.stream_chat(
            db, user_id, book_id, message, context=context,
            companion_mode=companion_mode, lang=lang,
        ):
            yield chunk.encode('utf-8')
    except GeneratorExit:
        # Client disconnected mid-stream; the service layer already
        # persisted any partial assistant message.
        logger.info('SSE stream closed early by client for book %s', book_id)
        raise
    except ValueError as exc:
        error_msg = f'data: {{"error": "{exc}"}}\n\n'
        yield error_msg.encode('utf-8')
    except Exception:
        logger.exception('Streaming error in agent chat')
        internal_msg = t('errors.internal_error')
        error_msg = f'data: {{"error": "{internal_msg}"}}\n\n'
        yield error_msg.encode('utf-8')


@router.post('/chat', response_model=ChatResponse, dependencies=[chat_limiter])
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Reading companion chat endpoint."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    try:
        result = await companion_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            message=body.message,
            context=body.context,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


_SSE_HEADERS = {
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
}


@router.post('/stream', dependencies=[stream_limiter])
@router.post('/chat/stream', dependencies=[stream_limiter])
async def stream(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Streaming reading companion chat (SSE)."""
    companion_mode = (
        body.context.get('companionMode', 'casual')
        if body.context else 'casual'
    )
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    return StreamingResponse(
        _sse_stream(
            db, current_user['id'], body.book_id, body.message,
            context=body.context, companion_mode=companion_mode,
            lang=lang,
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
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    try:
        result = await companion_service.summarize(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            chapter_ids=body.chapter_ids,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


@router.post('/explain', response_model=ChatResponse, dependencies=[ai_heavy_limiter])
async def explain(
    body: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Explain a passage from a book."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    try:
        result = await companion_service.explain(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            text=body.text,
            context=body.context,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


@router.get('/history', response_model=GenericResponse)
async def get_chat_history(
    book_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get chat history for a user, optionally filtered by book."""
    q = select(ChatMessage).where(
        ChatMessage.user_id == UUID(current_user['id']),
    )
    if book_id:
        q = q.where(ChatMessage.book_id == book_id)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    result = await db.execute(q)
    messages = list(result.scalars().all())
    return {
        'success': True,
        'data': [
            {
                'id': str(m.id),
                'book_id': str(m.book_id),
                'role': m.role,
                'content': m.content,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


@router.post('/discussion-questions', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def discussion_questions(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate discussion questions for a book."""
    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    try:
        result = await companion_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            message=body.message or 'Generate discussion questions for this book',
            context=body.context,
            lang=lang,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': result}


@router.post('/mood/scene', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def mood_scene(
    body: MoodSceneRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a mood-based scene description using the LLM."""
    import json

    from langchain_core.messages import HumanMessage, SystemMessage

    from app.services.llm import safe_llm_call

    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))
    mood = body.mood

    messages = [
        SystemMessage(content=(
            'You are an atmospheric reading companion. '
            'Reply only with valid JSON containing keys: '
            'scene (string, 2-3 sentence vivid description), '
            'suggestion (string, one short reading tip), '
            'color (string, hex color code).'
        )),
        HumanMessage(content=(
            f'The reader is in a "{mood}" mood. '
            f'Generate a mood-based reading scene. '
            f'Use language code: {lang}.'
        )),
    ]

    fallback = {
        'mood': mood,
        'scene': f'A calm, {mood} reading atmosphere.',
        'suggestion': 'Take a moment to settle in before you start reading.',
        'color': '#4A90D9',
    }

    try:
        raw = await safe_llm_call(messages, fallback='', log_label='mood-scene')
    except Exception:
        logger.warning('Mood scene LLM call failed, using fallback')
        raw = ''

    if raw:
        try:
            # Strip markdown fences if present
            text = raw.strip()
            if text.startswith('```'):
                text = text.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
            parsed = json.loads(text)
            data = {
                'mood': mood,
                'scene': parsed.get('scene', fallback['scene']),
                'suggestion': parsed.get('suggestion', fallback['suggestion']),
                'color': parsed.get('color', fallback['color']),
            }
        except (json.JSONDecodeError, KeyError):
            data = fallback
    else:
        data = fallback

    return {'success': True, 'data': data}


# ---------------------------------------------------------------------------
# AI Feedback (thumbs up/down)
# ---------------------------------------------------------------------------


@router.post('/feedback', response_model=GenericResponse)
async def submit_feedback(
    body: AIFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit feedback (thumbs up/down) for an AI response."""
    from app.models.ai_feedback import AIFeedback

    feedback = AIFeedback(
        user_id=UUID(current_user['id']),
        book_id=body.book_id,
        message_id=body.message_id,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(feedback)
    await db.flush()

    return {
        'success': True,
        'data': {
            'id': str(feedback.id),
            'rating': body.rating,
        },
    }


# ---------------------------------------------------------------------------
# Reading Plans
# ---------------------------------------------------------------------------


@router.post('/reading-plan', response_model=ReadingPlanResponse, dependencies=[ai_heavy_limiter])
async def create_reading_plan(
    body: ReadingPlanRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingPlanResponse:
    """Generate an AI reading plan for a book."""
    from app.services.reading_plan_service import generate_plan

    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))

    try:
        result = await generate_plan(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            total_days=body.total_days,
            daily_minutes=body.daily_minutes,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
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
    from app.services.reading_plan_service import get_active_plan

    result = await get_active_plan(
        db=db,
        user_id=UUID(current_user['id']),
        book_id=book_id,
    )
    if not result:
        return {'success': True, 'data': None}
    return {'success': True, 'data': result}


@router.post('/reading-plan/advance', response_model=GenericResponse)
async def advance_reading_plan(
    body: AdvancePlanRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Advance reading plan to the next day."""
    from app.services.reading_plan_service import advance_plan

    lang = current_user.get('lang') or await _get_user_lang(db, UUID(current_user['id']))

    result = await advance_plan(
        db=db,
        user_id=UUID(current_user['id']),
        book_id=body.book_id,
    )
    if not result:
        return {'success': True, 'data': None, 'message': t('errors.no_active_plan', lang)}
    return {'success': True, 'data': result}
