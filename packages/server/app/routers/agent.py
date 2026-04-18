"""Agent routes — reading companion chat, streaming, summarization, explanation."""

import logging
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.chat_message import ChatMessage
from app.schemas.agent import (
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    SummarizeRequest,
)
from app.services import companion_service

logger = logging.getLogger('read-pal.agent')

router = APIRouter(prefix='/api/v1/agent', tags=['agent'])


async def _sse_stream(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
) -> AsyncGenerator[bytes, None]:
    """Wrap companion_service.stream_chat as a bytes SSE generator."""
    try:
        async for chunk in companion_service.stream_chat(
            db, user_id, book_id, message,
        ):
            yield chunk.encode('utf-8')
    except ValueError as exc:
        error_msg = f'data: {{"error": "{exc}"}}\n\n'
        yield error_msg.encode('utf-8')
    except Exception:
        logger.exception('Streaming error in agent chat')
        error_msg = 'data: {"error": "Internal server error"}\n\n'
        yield error_msg.encode('utf-8')


@router.post('/chat', response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Reading companion chat endpoint."""
    try:
        result = await companion_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            message=body.message,
            context=body.context,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


@router.post('/stream')
async def stream(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Streaming reading companion chat (SSE)."""
    return StreamingResponse(
        _sse_stream(db, current_user['id'], body.book_id, body.message),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )


@router.post('/summarize', response_model=ChatResponse)
async def summarize(
    body: SummarizeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Summarize a book or specific chapters."""
    try:
        result = await companion_service.summarize(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            chapter_ids=body.chapter_ids,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


@router.post('/explain', response_model=ChatResponse)
async def explain(
    body: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Explain a passage from a book."""
    try:
        result = await companion_service.explain(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            text=body.text,
            context=body.context,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc

    return ChatResponse(data=result)


# --- Frontend compatibility aliases ---


@router.post('/chat/stream')
async def chat_stream_alias(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Alias for POST /stream — streaming chat via /chat/stream path."""
    return StreamingResponse(
        _sse_stream(db, current_user['id'], body.book_id, body.message),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )


@router.get('/history')
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


@router.post('/discussion-questions')
async def discussion_questions(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate discussion questions for a book."""
    try:
        result = await companion_service.chat(
            db=db,
            user_id=UUID(current_user['id']),
            book_id=body.book_id,
            message=body.message or 'Generate discussion questions for this book',
            context=body.context,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc
    return {'success': True, 'data': result}


@router.post('/mood/scene')
async def mood_scene(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a mood-based scene description."""
    mood = body.get('mood', 'neutral')
    return {
        'success': True,
        'data': {
            'mood': mood,
            'scene': f'A {mood} reading atmosphere',
            'suggestion': 'Enjoy your reading session',
            'color': '#4A90D9',
        },
    }
