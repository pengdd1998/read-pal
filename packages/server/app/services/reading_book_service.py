"""Business logic for reading book (memory book) retrieval.

Generation is delegated to memory_book_service.generate(); this module
handles the DB lookups for existing memory books.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory_book import MemoryBook
from app.schemas.memory_book import MemoryBookResponse


async def get_memory_book(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict | None:
    """Return a single memory book or None if not yet generated."""
    result = await db.execute(
        select(MemoryBook).where(
            MemoryBook.user_id == user_id,
            MemoryBook.book_id == book_id,
        ),
    )
    memory_book = result.scalar_one_or_none()
    if memory_book is None:
        return None
    response = MemoryBookResponse.model_validate(memory_book)
    return response.model_dump(mode='json', by_alias=True)


async def list_memory_books(
    db: AsyncSession,
    user_id: UUID,
) -> list[dict]:
    """Return all memory books for a user, newest first."""
    result = await db.execute(
        select(MemoryBook)
        .where(MemoryBook.user_id == user_id)
        .order_by(MemoryBook.generated_at.desc()),
    )
    books = list(result.scalars().all())
    return [
        MemoryBookResponse.model_validate(mb).model_dump(mode='json', by_alias=True)
        for mb in books
    ]
