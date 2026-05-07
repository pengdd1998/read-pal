"""Reading session routes.

All responses follow the shape: ``{"success": true, "data": {...}}``
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.utils import utcnow
from app.models.reading_session import ReadingSession
from app.models.book import Book
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


@router.get('/active', response_model=GenericResponse)
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


@router.patch('/{session_id}/end', response_model=GenericResponse)
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


# --- Frontend compatibility aliases ---


@router.post('/start', status_code=status.HTTP_201_CREATED, response_model=GenericResponse)
async def start_session(
    body: SessionStartRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Alias for POST / — create a new reading session."""
    book_id = body.book_id or body.bookId
    if not book_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={'code': 'VALIDATION_ERROR', 'message': t('errors.book_id_required')},
        )
    try:
        parsed_id = UUID(str(book_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={'code': 'VALIDATION_ERROR', 'message': f'Invalid book_id: {book_id}'},
        )
    session_body = SessionCreate(book_id=parsed_id)
    session = await reading_session_service.create_session(
        db, UUID(current_user['id']), session_body,
    )
    return {
        'success': True,
        'data': SessionResponse.model_validate(session).model_dump(mode='json'),
    }


@router.post('/{session_id}/end', response_model=GenericResponse)
async def end_session_post(
    session_id: UUID,
    body: SessionUpdate | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """POST alias for PATCH /{session_id}/end."""
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


@router.patch('/{session_id}/heartbeat', response_model=GenericResponse)
@router.post('/{session_id}/heartbeat', response_model=GenericResponse)
async def heartbeat_session(
    session_id: UUID,
    body: HeartbeatRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update session activity timestamp (heartbeat)."""
    result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.id == session_id,
            ReadingSession.user_id == UUID(current_user['id']),
        ),
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': t('errors.session_not_found')},
        )
    session.updated_at = utcnow()
    if body:
        pages_read = body.pages_read or body.pagesRead
        if pages_read is not None:
            session.pages_read = int(pages_read)
        scroll_progress = body.scroll_progress or body.scrollProgress
        if scroll_progress is not None:
            # Update book's scroll_progress for fine-grained tracking
            book_result = await db.execute(
                select(Book).where(Book.id == session.book_id, Book.user_id == UUID(current_user['id'])),
            )
            book = book_result.scalar_one_or_none()
            if book and book.total_pages > 0:
                book.scroll_progress = Decimal(str(round(scroll_progress, 3)))
                book.current_page = int(pages_read or session.pages_read or 0) - 1
                if book.current_page < 0:
                    book.current_page = 0
                book.progress = Decimal(
                    str(round(((book.current_page + scroll_progress) / book.total_pages) * 100, 2)),
                )
    await db.flush()
    return {'success': True, 'data': {'message': t('errors.heartbeat_received')}}


@router.post('/{session_id}/summarize', response_model=GenericResponse)
async def summarize_session(
    session_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limiter=ai_heavy_limiter,
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

    # Build a simple contextual summary based on session data
    duration_min = (session.duration or 0) // 60
    pages = session.pages_read or 0
    highlights = session.highlights or 0
    notes = session.notes or 0

    parts = []
    if duration_min > 0:
        parts.append(f'Read for {duration_min} minute{"s" if duration_min != 1 else ""}')
    if pages > 0:
        parts.append(f'covered {pages} page{"s" if pages != 1 else ""}')
    if highlights > 0:
        parts.append(f'made {highlights} highlight{"s" if highlights != 1 else ""}')
    if notes > 0:
        parts.append(f'wrote {notes} note{"s" if notes != 1 else ""}')

    if parts:
        summary = 'You ' + ', and '.join([
            ', '.join(parts[:-1]),
            parts[-1],
        ]) + '.' if len(parts) > 1 else parts[0] + '.'
    else:
        summary = 'Session recorded successfully.'

    return {'success': True, 'data': {'summary': summary}}


@router.get('/book/{book_id}/log', response_model=SessionListResponse)
async def get_book_session_log(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get all sessions for a specific book."""
    result = await db.execute(
        select(ReadingSession)
        .where(
            ReadingSession.user_id == UUID(current_user['id']),
            ReadingSession.book_id == book_id,
        )
        .order_by(ReadingSession.started_at.desc()),
    )
    sessions = list(result.scalars().all())
    return {
        'success': True,
        'data': [
            SessionResponse.model_validate(s).model_dump(mode='json')
            for s in sessions
        ],
        'total': len(sessions),
    }
