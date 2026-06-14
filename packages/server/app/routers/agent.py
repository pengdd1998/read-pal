"""Agent routes — reading companion chat, streaming, summarization, explanation, plans, feedback."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter, chat_limiter, stream_limiter, write_limiter
from app.middleware.daily_llm_budget import daily_ai_budget
from app.schemas.agent import (
    AdvancePlanRequest,
    AIFeedbackRequest,
    CancelStreamRequest,
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    MoodSceneRequest,
    ReadingPlanRequest,
    ReadingPlanResponse,
    RegenerateRequest,
    SummarizeRequest,
)
from app.schemas.common import GenericResponse
from app.services import companion_service
from app.services.agent_service import (
    cancel_stream,
    new_request_id,
    raise_not_found,
    resolve_lang,
    sse_bytes_stream,
)
from app.services.chat_service import get_chat_history, get_chat_history_page
from app.services.feedback_service import submit_feedback as submit_feedback_svc
from app.services.mood_service import generate_mood_scene
from app.services.reading_plan_service import advance_plan, generate_plan, get_active_plan
from app.utils.i18n import t
from app.middleware.rate_limiter import api_limiter

logger = logging.getLogger('read-pal.agent')

router = APIRouter(prefix='/api/v1/agent', tags=['agent'], dependencies=[api_limiter])

_SSE_HEADERS = {
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
}


@router.get('/health', response_model=GenericResponse)
async def llm_health() -> dict:
    """Public health check for the LLM service (no auth required)."""
    from app.services.llm import check_llm_health

    try:
        return await check_llm_health()
    except Exception as exc:
        logger.error('Health check failed: %s', exc, exc_info=True)
        return {'success': True, 'data': {'healthy': False, 'error': 'Health check failed'}}


@router.post('/chat', response_model=ChatResponse, dependencies=[chat_limiter, write_limiter, daily_ai_budget])
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
            persona=body.persona, genre=body.genre, lang=lang,
        )
    except ValueError as exc:
        logger.debug('validation error in agent')
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.post('/stream', dependencies=[stream_limiter, write_limiter, daily_ai_budget])
@router.post('/chat/stream', dependencies=[stream_limiter, write_limiter, daily_ai_budget])
async def stream(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Streaming reading companion chat (SSE).

    The first SSE frame is ``data: {"request_id": "<id>"}\\n\\n`` so the
    client can later POST ``/chat/cancel`` with that id to cooperatively
    cancel the in-flight stream (P0-3).
    """
    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    companion_mode = body.context.get('companionMode', 'casual') if body.context else 'casual'
    persona = (body.context.get('persona') if body.context else None) or body.persona
    genre = body.genre
    request_id = new_request_id()
    return StreamingResponse(
        sse_bytes_stream(
            db, uid, body.book_id, body.message,
            context=body.context, companion_mode=companion_mode,
            persona=persona, genre=genre, lang=lang,
            request_id=request_id,
        ),
        media_type='text/event-stream',
        headers=_SSE_HEADERS,
    )


@router.post('/chat/cancel', response_model=GenericResponse, dependencies=[write_limiter])
async def cancel_chat_stream(
    body: CancelStreamRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Cooperatively cancel an in-flight companion stream by request_id.

    The request_id is returned as the first SSE frame of /chat/stream. We
    don't verify ownership beyond the authenticated user because request_ids
    are unguessable (12-byte random hex) and the worst case is a no-op.
    Returns 200 with ``cancelled: false`` if the stream is unknown or done.
    """
    cancelled = cancel_stream(body.request_id)
    return {'success': True, 'data': {'cancelled': cancelled}}


@router.post('/chat/regenerate', dependencies=[stream_limiter, write_limiter, daily_ai_budget])
async def regenerate(
    body: RegenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Soft-delete the last assistant message and re-stream a fresh response.

    The last user message is reused as the prompt; the previous assistant
    response is marked ``deleted_at=NOW()`` (preserved for audit) so the new
    stream sees a clean history. Streams the new response like /chat/stream.
    """
    from datetime import datetime, timezone
    from sqlalchemy import select, update
    from app.models.chat_message import ChatMessage

    uid = UUID(current_user['id'])
    lang = await resolve_lang(db, uid)
    book_id = body.book_id

    # Find the most recent user message and the assistant message right
    # after it (if any). Both must belong to this user+book and not be
    # already soft-deleted.
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == uid,
            ChatMessage.book_id == book_id,
            ChatMessage.deleted_at.is_(None),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(2)
    )
    last_two = list(result.scalars().all())  # newest first
    if not last_two:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NO_HISTORY', 'message': 'No user message to regenerate from.'},
        )

    last_msg = last_two[0]
    if last_msg.role == 'assistant':
        # Soft-delete the last assistant message; the user message is now last_two[1]
        await db.execute(
            update(ChatMessage)
            .where(ChatMessage.id == last_msg.id)
            .values(deleted_at=datetime.now(timezone.utc))
        )
        user_msg = last_two[1] if len(last_two) > 1 else None
    else:
        user_msg = last_msg

    if user_msg is None or user_msg.role != 'user':
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NO_USER_MESSAGE', 'message': 'No user message to regenerate from.'},
        )

    companion_mode = (body.context or {}).get('companionMode', 'casual')
    persona = (body.context or {}).get('persona') or body.persona
    genre = body.genre
    request_id = new_request_id()

    # Re-stream. We send the user message text back through stream_chat
    # which will load fresh history (now excluding the soft-deleted row)
    # and produce a new assistant response.
    return StreamingResponse(
        sse_bytes_stream(
            db, uid, book_id, user_msg.content,
            context=body.context, companion_mode=companion_mode,
            persona=persona, genre=genre, lang=lang,
            request_id=request_id,
        ),
        media_type='text/event-stream',
        headers=_SSE_HEADERS,
    )


@router.post('/summarize', response_model=ChatResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget])
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
        logger.debug('validation error in agent')
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.post('/explain', response_model=ChatResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget])
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
        logger.debug('validation error in agent')
        raise_not_found(exc, lang)
    return ChatResponse(data=result)


@router.get('/history')
async def get_chat_history_endpoint(
    book_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    before: UUID | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get chat history for a user, optionally filtered by book.

    Backwards-compatible flat list when ``before`` is omitted (no
    ``nextCursor`` key in response). Cursor-paginated when ``before`` is
    provided, returning ``{items: [...], nextCursor: str|null}``.

    Note: no ``response_model`` — the response shape varies between the
    flat (no cursor) and paginated (with cursor) branches, and applying a
    Pydantic model would strip the ``nextCursor`` field.
    """
    if before is None:
        messages = await get_chat_history(
            db, UUID(current_user['id']), book_id=book_id, limit=limit,
        )
        return {'success': True, 'data': messages}
    page = await get_chat_history_page(
        db, UUID(current_user['id']),
        book_id=book_id, limit=limit, before_id=before,
    )
    return {
        'success': True,
        'data': page['items'],
        'nextCursor': page['nextCursor'],
    }


@router.post('/discussion-questions', response_model=GenericResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget])
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
        logger.debug('validation error in agent')
        raise_not_found(exc, lang)
    except (ConnectionError, TimeoutError) as exc:
        logger.error('Discussion questions failed: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_unavailable', lang)},
        ) from exc
    return {'success': True, 'data': result}


@router.post('/mood/scene', response_model=GenericResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget])
async def mood_scene(
    body: MoodSceneRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a mood-based scene description using the LLM."""
    lang = await resolve_lang(db, UUID(current_user['id']))
    try:
        data = await generate_mood_scene(
            db, UUID(current_user['id']),
            mood=body.mood, text=body.text, lang=lang,
        )
    except (ConnectionError, TimeoutError) as exc:
        logger.error('Mood scene generation failed: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_unavailable', lang)},
        ) from exc
    return {'success': True, 'data': data}


@router.post('/feedback', response_model=GenericResponse, dependencies=[write_limiter])
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


@router.post('/reading-plan', response_model=ReadingPlanResponse, dependencies=[ai_heavy_limiter, write_limiter, daily_ai_budget])
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
        logger.debug('validation error in agent')
        raise_not_found(exc, lang)
    except (ConnectionError, TimeoutError) as exc:
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


@router.post('/reading-plan/advance', response_model=GenericResponse, dependencies=[write_limiter])
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
