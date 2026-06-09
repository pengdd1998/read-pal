"""Book progress helpers for reading session operations.

Handles updating book state (page, scroll, segment, completion)
based on reading session activity.
"""

import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

logger = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.utils import utcnow


def cap_progress(progress: Decimal) -> Decimal:
    """Cap progress at 100%."""
    return min(progress, Decimal('100'))


def update_book_completion(book: Book, now: datetime) -> None:
    """Mark book completed if all pages read."""
    if book.current_page >= book.total_pages and book.status != BookStatus.completed:
        book.progress = Decimal('100')
        book.status = BookStatus.completed
        book.completed_at = now


async def update_book_with_page(
    db: AsyncSession,
    book_id: UUID,
    user_id: str,
    now: datetime,
    current_page: int,
    scroll_progress: float | None,
    current_segment: str | None,
) -> None:
    """Update book progress when client sends an explicit current_page."""
    try:
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = result.scalar_one_or_none()
        if not book or book.total_pages <= 0:
            return
        book.last_read_at = now
        book.current_page = min(max(current_page, 0), book.total_pages)
        sp = scroll_progress if scroll_progress is not None else float(book.scroll_progress or 0)
        book.scroll_progress = Decimal(str(round(sp, 3)))
        if current_segment is not None:
            book.current_segment = current_segment
        book.progress = cap_progress(
            Decimal(str(round((book.current_page / book.total_pages) * 100, 2))),
        )
        update_book_completion(book, now)
    except DBAPIError:
        logger.error('update_book_with_page failed', exc_info=True, book_id=str(book_id))
        raise


async def update_book_scroll_only(
    db: AsyncSession,
    book_id: UUID,
    user_id: str,
    now: datetime,
    scroll_progress: float | None,
    current_segment: str | None,
) -> None:
    """Update book scroll/segment progress without changing current_page."""
    try:
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = result.scalar_one_or_none()
        if not book:
            return
        book.last_read_at = now
        if scroll_progress is not None:
            book.scroll_progress = Decimal(str(round(scroll_progress, 3)))
        if current_segment is not None:
            book.current_segment = current_segment
    except DBAPIError:
        logger.error('update_book_scroll_only failed', exc_info=True, book_id=str(book_id))
        raise


async def update_book_heartbeat(
    db: AsyncSession,
    book_id: UUID,
    user_id: UUID,
    pages_read: int | None,
    session_pages_read: int | None,
    scroll_progress: float | None,
    current_segment: str | None,
) -> None:
    """Update book progress fields during a session heartbeat."""
    try:
        book_result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = book_result.scalar_one_or_none()
        if not book or book.total_pages <= 0:
            return
        if scroll_progress is not None:
            book.scroll_progress = Decimal(str(round(scroll_progress, 3)))
        if current_segment is not None:
            book.current_segment = current_segment
        pages_read_val = int(pages_read or session_pages_read or 0)
        heartbeat_page = max(0, min(pages_read_val - 1, book.total_pages))
        if heartbeat_page <= book.current_page:
            return
        book.current_page = heartbeat_page
        book.progress = cap_progress(
            Decimal(str(round((book.current_page / book.total_pages) * 100, 2))),
        )
        update_book_completion(book, utcnow())
    except DBAPIError:
        logger.error('update_book_heartbeat failed', exc_info=True, book_id=str(book_id))
        raise
