"""Business logic for book CRUD operations."""

import logging
import uuid
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.utils import utcnow
from app.schemas.book import BookCreate, BookUpdate

logger = logging.getLogger('read-pal.books')


async def get_user_books(
    db: AsyncSession,
    user_id: str,
    status: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Book], int]:
    """Return paginated list of user's books, ordered by last_read_at desc."""
    base = select(Book).where(Book.user_id == user_id)
    count_base = select(func.count()).select_from(Book).where(Book.user_id == user_id)

    if status:
        base = base.where(Book.status == status)
        count_base = count_base.where(Book.status == status)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        base.order_by(Book.last_read_at.desc().nulls_last(), Book.added_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    books = list(result.scalars().all())

    return books, total


async def get_book(db: AsyncSession, user_id: str, book_id: UUID) -> Book | None:
    """Return a single book, verifying ownership."""
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    return result.scalar_one_or_none()


async def create_book(
    db: AsyncSession,
    user_id: str,
    data: BookCreate,
) -> Book:
    """Create a new book with status='unread'."""
    book = Book(
        id=uuid.uuid4(),
        user_id=user_id,
        title=data.title,
        author=data.author,
        cover_url=data.cover_url,
        file_type=data.file_type,
        file_size=data.file_size,
        total_pages=data.total_pages,
        tags=data.tags,
        status=BookStatus.unread,
        progress=Decimal('0'),
    )
    db.add(book)
    await db.flush()

    logger.info('Book created: %s (%s) for user %s', book.title, book.id, user_id)
    return book


async def update_book(
    db: AsyncSession,
    user_id: str,
    book_id: UUID,
    data: BookUpdate,
) -> Book | None:
    """Partially update a book. Set started_at/completed_at on status change."""
    book = await get_book(db, user_id, book_id)
    if book is None:
        return None

    now = utcnow()
    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(book, field, value)

    # Handle status transitions
    if data.status == 'reading' and book.started_at is None:
        book.started_at = now
    if data.status == 'completed' and book.completed_at is None:
        book.completed_at = now
        if book.progress < Decimal('100'):
            book.progress = Decimal('100')

    await db.flush()

    logger.info('Book updated: %s for user %s', book_id, user_id)
    return book


async def delete_book(db: AsyncSession, user_id: str, book_id: UUID) -> bool:
    """Delete a book and all cascading data."""
    book = await get_book(db, user_id, book_id)
    if book is None:
        return False

    await db.delete(book)
    await db.flush()

    logger.info('Book deleted: %s for user %s', book_id, user_id)
    return True


async def get_book_stats(db: AsyncSession, user_id: str) -> dict:
    """Return aggregate book statistics for a user."""
    total_result = await db.execute(
        select(func.count()).select_from(Book).where(Book.user_id == user_id),
    )
    total = total_result.scalar() or 0

    status_counts = await db.execute(
        select(Book.status, func.count())
        .where(Book.user_id == user_id)
        .group_by(Book.status),
    )
    counts_by_status = dict(status_counts.all())

    pages_result = await db.execute(
        select(func.coalesce(func.sum(Book.current_page), 0)).where(
            Book.user_id == user_id,
        ),
    )
    total_pages_read = pages_result.scalar() or 0

    return {
        'total': total,
        'reading': counts_by_status.get('reading', 0),
        'completed': counts_by_status.get('completed', 0),
        'unread': counts_by_status.get('unread', 0),
        'total_pages_read': int(total_pages_read),
    }


async def update_tags(
    db: AsyncSession,
    user_id: str,
    book_id: UUID,
    tags: list[str],
) -> Book | None:
    """Set the tags for a book."""
    book = await get_book(db, user_id, book_id)
    if book is None:
        return None

    book.tags = tags
    await db.flush()

    logger.info('Tags updated for book %s', book_id)
    return book
