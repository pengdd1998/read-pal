"""Reading book (Personal Reading Book) routes — generate and retrieve memory books."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.memory_book import MemoryBook
from app.schemas.memory_book import MemoryBookGenerateRequest, MemoryBookResponse
from app.services.memory_book_service import generate
from app.utils.i18n import t

logger = logging.getLogger('read-pal.reading_book')

router = APIRouter(prefix='/api/v1/reading-book', tags=['reading-book'])


@router.post('/generate')
async def generate_memory_book(
    body: MemoryBookGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a Personal Reading Book for a given book."""
    try:
        result = await generate(
            db,
            UUID(current_user['id']),
            body.book_id,
            body.format,
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


@router.get('/{book_id}')
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


@router.get('')
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
