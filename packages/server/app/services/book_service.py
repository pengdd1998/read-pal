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
from app.utils.sanitizer import sanitize_book_field, strip_html

logger = logging.getLogger('read-pal.books')


async def get_user_books(
    db: AsyncSession,
    user_id: str,
    status: str | None = None,
    search: str | None = None,
    tag: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Book], int]:
    """Return paginated list of user's books, ordered by last_read_at desc."""
    base = select(Book).where(Book.user_id == user_id)
    count_base = select(func.count()).select_from(Book).where(Book.user_id == user_id)

    if status:
        base = base.where(Book.status == status)
        count_base = count_base.where(Book.status == status)

    if search:
        pattern = f'%{search}%'
        search_filter = (Book.title.ilike(pattern) | Book.author.ilike(pattern))
        base = base.where(search_filter)
        count_base = count_base.where(search_filter)

    if tag:
        tag_filter = Book.tags.any(tag)
        base = base.where(tag_filter)
        count_base = count_base.where(tag_filter)

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
        title=sanitize_book_field(data.title),
        author=sanitize_book_field(data.author),
        cover_url=data.cover_url,
        file_type=data.file_type,
        file_size=data.file_size,
        total_pages=data.total_pages,
        tags=[strip_html(t) for t in (data.tags or [])],
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

    # Sanitize text fields to prevent stored XSS
    if 'title' in update_data:
        update_data['title'] = sanitize_book_field(update_data['title'])
    if 'author' in update_data:
        update_data['author'] = sanitize_book_field(update_data['author'])
    if 'tags' in update_data and update_data['tags']:
        update_data['tags'] = [strip_html(t) for t in update_data['tags']]

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
        book.progress = Decimal(
            str(round((book.current_page / book.total_pages) * 100, 2)),
        )
        if book.progress >= Decimal('100') and book.status != BookStatus.completed:
            book.status = BookStatus.completed
            book.completed_at = now

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

    # Normalize keys to plain strings (handle both enum values and strings)
    normalized: dict[str, int] = {}
    for key, count in counts_by_status.items():
        normalized[str(key.value if hasattr(key, 'value') else key)] = count

    pages_result = await db.execute(
        select(func.coalesce(func.sum(Book.current_page), 0)).where(
            Book.user_id == user_id,
        ),
    )
    total_pages_read = pages_result.scalar() or 0

    return {
        'total': total,
        'reading': normalized.get('reading', 0),
        'completed': normalized.get('completed', 0),
        'unread': normalized.get('unread', 0),
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
