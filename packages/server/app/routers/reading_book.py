"""Reading book (Personal Reading Book) routes — generate and retrieve memory books."""

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
from app.utils.i18n import t

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
    """Generate a Personal Reading Book for a given book."""
    resolved_id = book_id or (body.book_id if body else None)
    if resolved_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={'code': 'VALIDATION_ERROR', 'message': 'book_id is required'},
        )
    fmt = body.format if body else 'personal_book'
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
            detail={'code': 'NOT_FOUND', 'message': str(exc)},
        ) from exc


@router.get('/{book_id}', response_model=GenericResponse)
async def get_memory_book(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get an existing memory book for a book."""
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == UUID(current_user['id']),
            MemoryBook.book_id == book_id,
        ),
    )
    memory_book = result.scalar_one_or_none()

    if memory_book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                'code': 'NOT_FOUND',
                'message': t('errors.memory_book_not_found'),
            },
        )

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
