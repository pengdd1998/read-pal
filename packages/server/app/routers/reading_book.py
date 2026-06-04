"""Reading Mirror routes — generate and retrieve reading mirrors."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.schemas.common import GenericResponse
from app.schemas.memory_book import MemoryBookGenerateRequest
from app.services import reading_book_service
from app.services.memory_book_service import generate
from app.utils.i18n import translate_error, t

logger = logging.getLogger('read-pal.reading_book')

router = APIRouter(prefix='/api/v1/reading-book', tags=['reading-book'])


@router.post('/generate', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def generate_memory_book_query(
    book_id: UUID | None = None,
    body: MemoryBookGenerateRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a Reading Mirror (book_id via query param or body)."""
    resolved_id = book_id or (body.book_id if body else None)
    if resolved_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={'code': 'VALIDATION_ERROR', 'message': t('errors.book_id_required')},
        )
    fmt = body.format if body else 'reading_mirror'
    try:
        result = await generate(
            db,
            UUID(current_user['id']),
            resolved_id,
            fmt,
        )
        return {
            'success': True,
            'data': result.model_dump(mode='json', by_alias=True),
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': translate_error(exc)},
        ) from exc


@router.post('/{book_id}/generate', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def generate_memory_book_path(
    book_id: UUID,
    body: MemoryBookGenerateRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a Reading Mirror (book_id in URL path)."""
    fmt = body.format if body else 'reading_mirror'
    try:
        result = await generate(
            db,
            UUID(current_user['id']),
            book_id,
            fmt,
        )
        return {
            'success': True,
            'data': result.model_dump(mode='json', by_alias=True),
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': translate_error(exc)},
        ) from exc


@router.get('/{book_id}', response_model=GenericResponse)
async def get_memory_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get an existing memory book for a book. Returns data=null if not generated yet."""
    data = await reading_book_service.get_memory_book(
        db, UUID(current_user['id']), book_id,
    )
    return {'success': True, 'data': data}


@router.get('', response_model=GenericResponse)
async def list_memory_books(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all memory books for the current user."""
    books = await reading_book_service.list_memory_books(
        db, UUID(current_user['id']),
    )
    return {'success': True, 'data': books}
