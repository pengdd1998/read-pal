"""Reading session routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.schemas.reading_session import (
    HeartbeatRequest,
    SessionCreate,
    SessionListResponse,
    SessionResponse,
    SessionStartRequest,
    SessionStatsResponse,
    SessionUpdate,
)
from app.schemas.common import GenericResponse
from app.services import reading_session_service
from app.utils.i18n import t

router = APIRouter(prefix='/api/v1/sessions', tags=['sessions'])


@router.get('', response_model=SessionListResponse)
async def list_sessions(
    book_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionListResponse:
    """List reading sessions with optional book filter."""
    sessions, total = await reading_session_service.get_sessions(
        db, UUID(current_user['id']), book_id=book_id, page=page, per_page=per_page,
    )
    return SessionListResponse(
        data=[SessionResponse.model_validate(s) for s in sessions],
        total=total, page=page, per_page=per_page,
        has_more=(page * per_page) < total,
    )


@router.get('/active', response_model=GenericResponse)
async def get_active_session(
    book_id: UUID | None = Query(None),
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


@router.get('/{session_id}', response_model=GenericResponse)
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
            detail={'code': 'NOT_FOUND', 'message': t('errors.session_not_found')},
        )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.post('', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
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


@router.api_route('/{session_id}/end', methods=['PATCH', 'POST'], response_model=GenericResponse)
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
            detail={'code': 'NOT_FOUND', 'message': t('errors.session_not_found')},
        )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.post('/start', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
async def start_session(
    body: SessionStartRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Alias for POST / — create a new reading session."""
    session = await reading_session_service.create_session(
        db, UUID(current_user['id']), SessionCreate(book_id=body.book_id),
    )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.patch('/{session_id}/heartbeat', response_model=GenericResponse)
@router.post('/{session_id}/heartbeat', response_model=GenericResponse)
async def heartbeat_session(
    session_id: UUID,
    body: HeartbeatRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update session activity timestamp (heartbeat)."""
    session = await reading_session_service.heartbeat_session(
        db, UUID(current_user['id']), session_id, body,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.session_not_found')},
        )
    return {'success': True, 'data': {'message': t('errors.heartbeat_received')}}


@router.post('/{session_id}/summarize', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def summarize_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a brief AI summary of the reading session."""
    session = await reading_session_service.get_session(
        db, UUID(current_user['id']), session_id,
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.session_not_found')},
        )
    summary = reading_session_service.build_session_summary(session)
    return {'success': True, 'data': {'summary': summary}}


@router.get('/book/{book_id}/log', response_model=SessionListResponse)
async def get_book_session_log(
    book_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get sessions for a specific book with pagination."""
    uid = UUID(current_user['id'])
    sessions, total = await reading_session_service.get_book_session_log(
        db, uid, book_id, page=page, per_page=per_page,
    )
    offset = (page - 1) * per_page
    return {
        'success': True,
        'data': [
            SessionResponse.model_validate(s).model_dump(mode='json')
            for s in sessions
        ],
        'total': total,
        'page': page,
        'per_page': per_page,
        'has_more': (offset + len(sessions)) < total,
    }
