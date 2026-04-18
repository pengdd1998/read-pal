"""Reading session routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.reading_session import (
    SessionCreate,
    SessionListResponse,
    SessionResponse,
    SessionStatsResponse,
    SessionUpdate,
)
from app.services import reading_session_service

router = APIRouter(prefix='/api/v1/sessions', tags=['sessions'])


@router.get('/', response_model=SessionListResponse)
async def list_sessions(
    book_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionListResponse:
    """List reading sessions with optional book filter."""
    sessions, total = await reading_session_service.get_sessions(
        db,
        UUID(current_user['id']),
        book_id=book_id,
        page=page,
        per_page=per_page,
    )
    return SessionListResponse(
        data=[SessionResponse.model_validate(s) for s in sessions],
        total=total,
    )


@router.get('/active')
async def get_active_session(
    book_id: UUID = Query(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the active reading session for a book, if any."""
    session = await reading_session_service.get_active_session(
        db, UUID(current_user['id']), book_id,
    )
    if session is None:
        return {'success': True, 'data': None}
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.get('/stats', response_model=SessionStatsResponse)
async def get_session_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionStatsResponse:
    """Return aggregate reading session statistics."""
    stats = await reading_session_service.get_session_stats(db, UUID(current_user['id']))
    return SessionStatsResponse(data=stats)


@router.get('/{session_id}')
async def get_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a single reading session by ID."""
    session = await reading_session_service.get_session(
        db, UUID(current_user['id']), session_id,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Session not found'},
        )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.post('/', status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new reading session and auto-start it."""
    session = await reading_session_service.create_session(
        db, UUID(current_user['id']), body,
    )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.patch('/{session_id}/end')
async def end_session(
    session_id: UUID,
    body: SessionUpdate | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """End an active reading session and update book progress."""
    session = await reading_session_service.end_session(
        db, UUID(current_user['id']), session_id, data=body,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Session not found'},
        )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }
