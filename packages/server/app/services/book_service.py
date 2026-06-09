"""Business logic for book CRUD operations."""

import logging
import uuid
from decimal import Decimal
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services._session_book_progress import cap_progress

from app.models.book import Book, BookFileType, BookStatus
from app.models.collection import Collection
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
    await db.refresh(book)

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

    # Recalculate progress when currentPage is updated
    if data.current_page is not None and book.total_pages > 0:
        book.current_page = min(max(book.current_page, 0), book.total_pages)
        book.progress = cap_progress(
            Decimal(str(round((book.current_page / book.total_pages) * 100, 2))),
        )
        if book.progress >= Decimal('100') and book.status != BookStatus.completed:
            book.status = BookStatus.completed
            book.completed_at = now

    await db.flush()
    return book


async def delete_book(db: AsyncSession, user_id: str, book_id: UUID) -> bool:
    """Delete a book and all cascading data."""
    book = await get_book(db, user_id, book_id)
    if book is None:
        return False

    await db.delete(book)
    await _cleanup_collection_orphans(db, book_id)
    await db.flush()

    logger.info('Book deleted: %s for user %s', book_id, user_id)
    return True


async def get_book_stats(db: AsyncSession, user_id: str) -> dict:
    """Return aggregate book statistics for a user (cached 5 min, single query)."""
    from app.core.cache import cache_get_or_compute

    cache_key = f'stats:books:{user_id}'

    async def _compute() -> dict:
        row = (await db.execute(
            select(
                func.count().label('total'),
                func.coalesce(func.sum(
                    case((Book.status == 'reading', 1), else_=0),
                ), 0).label('reading'),
                func.coalesce(func.sum(
                    case((Book.status == 'completed', 1), else_=0),
                ), 0).label('completed'),
                func.coalesce(func.sum(
                    case((Book.status == 'unread', 1), else_=0),
                ), 0).label('unread'),
                func.coalesce(func.sum(Book.current_page), 0).label('pages'),
            ).where(Book.user_id == user_id)
        )).one()
        return {
            'total': row.total,
            'reading': int(row.reading),
            'completed': int(row.completed),
            'unread': int(row.unread),
            'totalPagesRead': int(row.pages),
        }

    return await cache_get_or_compute(cache_key, _compute)


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


async def create_sample_book(
    db: AsyncSession,
    user_id: str,
    title: str = 'Sample Book',
    author: str = 'Sample Author',
) -> Book:
    """Create a minimal sample book for testing."""
    sample = Book(
        user_id=user_id,
        title=title,
        author=author,
        file_type=BookFileType.epub,
        file_size=1024,
        total_pages=1,
        current_page=0,
        status=BookStatus.unread,
        tags=['sample'],
    )
    db.add(sample)
    await db.flush()
    await db.refresh(sample)
    return sample


async def _cleanup_collection_orphans(db: AsyncSession, book_id: UUID) -> None:
    """Remove deleted book_id from all collections that reference it."""
    result = await db.execute(
        select(Collection).where(Collection.book_ids.contains([str(book_id)]))
    )
    for col in result.scalars():
        col.book_ids = [bid for bid in (col.book_ids or []) if bid != str(book_id)]


async def get_book_chapter_ids(
    db: AsyncSession, user_id: UUID, book_id: UUID, lang: str,
) -> list[dict[str, str]]:
    """Return chapter ID list for a book (used by offline caching)."""
    from app.services.upload_service import get_book_content
    book = await get_book(db, user_id, book_id)
    if book is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={'code': 'NOT_FOUND', 'message': f'Book {book_id} not found'})
    data = await get_book_content(db, user_id, book_id, lang)
    chapters = data.get('chapters', []) if data else []
    return [{'id': c['id']} for c in chapters]
