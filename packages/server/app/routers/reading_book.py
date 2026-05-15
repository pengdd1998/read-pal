"""Reading Mirror routes — generate and retrieve reading mirrors."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.models.memory_book import MemoryBook
from app.schemas.common import GenericResponse
from app.schemas.memory_book import MemoryBookGenerateRequest, MemoryBookResponse
from app.services.memory_book_service import generate
from app.utils.i18n import _get_user_lang, translate_error, t

logger = logging.getLogger('read-pal.reading_book')

router = APIRouter(prefix='/api/v1/reading-book', tags=['reading-book'])


@router.post('/generate', response_model=GenericResponse)
@router.post('/{book_id}/generate', response_model=GenericResponse)
async def generate_memory_book(
    book_id: UUID | None = None,
    body: MemoryBookGenerateRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limiter=ai_heavy_limiter,
) -> dict:
    """Generate a Reading Mirror for a given book."""
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


@router.get('/{book_id}', response_model=GenericResponse)
async def get_memory_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get an existing memory book for a book. Returns data=null if not generated yet."""
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == UUID(current_user['id']),
            MemoryBook.book_id == book_id,
        ),
    )
    memory_book = result.scalar_one_or_none()

    if memory_book is None:
        return {'success': True, 'data': None}

    response = MemoryBookResponse.model_validate(memory_book)
    return {
        'success': True,
        'data': response.model_dump(mode='json', by_alias=True),
    }


@router.get('', response_model=GenericResponse)
async def list_memory_books(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all memory books for the current user."""
    result = await db.execute(
        select(MemoryBook)
        .where(MemoryBook.user_id == UUID(current_user['id']))
        .order_by(MemoryBook.generated_at.desc()),
    )
    books = list(result.scalars().all())

    return {
        'success': True,
        'data': [
            MemoryBookResponse.model_validate(mb).model_dump(mode='json', by_alias=True)
            for mb in books
        ],
    }
