"""Business logic for reading book (memory book) retrieval.

Generation is delegated to memory_book_service.generate(); this module
handles the DB lookups for existing memory books.
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory_book import MemoryBook
from app.schemas.memory_book import MemoryBookResponse
from app.utils.limits import READING_BOOK_FETCH_LIMIT

logger = logging.getLogger('read-pal.reading_book')


async def get_memory_book(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict | None:
    """Return a single memory book or None if not yet generated."""
    try:
        result = await db.execute(
            select(MemoryBook).where(
                MemoryBook.user_id == user_id,
                MemoryBook.book_id == book_id,
            ),
        )
        memory_book = result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.error('reading_book_service.get_memory_book DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    if memory_book is None:
        return None
    response = MemoryBookResponse.model_validate(memory_book)
    return response.model_dump(mode='json', by_alias=True)


async def list_memory_books(
    db: AsyncSession,
    user_id: UUID,
) -> list[dict]:
    """Return all memory books for a user, newest first."""
    try:
        result = await db.execute(
            select(MemoryBook)
            .where(MemoryBook.user_id == user_id)
            .order_by(MemoryBook.generated_at.desc())
            .limit(READING_BOOK_FETCH_LIMIT),
        )
        books = list(result.scalars().all())
    except DBAPIError as exc:
        logger.error('reading_book_service.list_memory_books DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    return [
        MemoryBookResponse.model_validate(mb).model_dump(mode='json', by_alias=True)
        for mb in books
    ]
