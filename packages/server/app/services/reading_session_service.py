"""Business logic for reading session operations."""

import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.models.reading_session import ReadingSession
from app.schemas.reading_session import SessionCreate, SessionUpdate

logger = logging.getLogger('read-pal.sessions')


async def create_session(
    db: AsyncSession,
    user_id: str,
    data: SessionCreate,
) -> ReadingSession:
    """Create a new reading session, mark it active, update book status."""
    now = datetime.utcnow()
    session = ReadingSession(
        user_id=user_id,
        book_id=data.book_id,
        started_at=data.started_at or now,
        is_active=True,
    )
    db.add(session)

    # Update book status to 'reading'
    result = await db.execute(
        select(Book).where(Book.id == data.book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book and book.status != BookStatus.reading:
        book.status = BookStatus.reading
        if book.started_at is None:
            book.started_at = now

    await db.flush()

    logger.info('Session created: %s for book %s', session.id, data.book_id)
    return session


async def end_session(
    db: AsyncSession,
    user_id: str,
    session_id: UUID,
    data: SessionUpdate | None = None,
) -> ReadingSession | None:
    """End an active session and update book progress."""
    result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.id == session_id,
            ReadingSession.user_id == user_id,
        ),
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None

    now = datetime.utcnow()
    session.ended_at = now
    session.is_active = False

    # Apply additional update fields if provided
    if data:
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field != 'is_active':
                setattr(session, field, value)

    # Update book current_page, progress, and last_read_at
    if session.pages_read:
        book_result = await db.execute(
            select(Book).where(Book.id == session.book_id, Book.user_id == user_id),
        )
        book = book_result.scalar_one_or_none()
        if book:
            book.last_read_at = now
            if book.total_pages > 0:
                book.current_page = min(
                    book.current_page + session.pages_read,
                    book.total_pages,
                )
                book.progress = Decimal(
                    str(round((book.current_page / book.total_pages) * 100, 2)),
                )

    await db.flush()

    logger.info('Session ended: %s', session_id)
    return session


async def get_active_session(
    db: AsyncSession,
    user_id: str,
    book_id: UUID,
) -> ReadingSession | None:
    """Find the active session for a given book."""
    result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.user_id == user_id,
            ReadingSession.book_id == book_id,
            ReadingSession.is_active == True,  # noqa: E712
        ),
    )
    return result.scalar_one_or_none()


async def get_sessions(
    db: AsyncSession,
    user_id: str,
    book_id: UUID | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[ReadingSession], int]:
    """Return paginated list of reading sessions."""
    base = select(ReadingSession).where(ReadingSession.user_id == user_id)
    count_base = (
        select(func.count())
        .select_from(ReadingSession)
        .where(ReadingSession.user_id == user_id)
    )

    if book_id:
        base = base.where(ReadingSession.book_id == book_id)
        count_base = count_base.where(ReadingSession.book_id == book_id)

    total_result = await db.execute(count_base)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        base.order_by(ReadingSession.started_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    sessions = list(result.scalars().all())

    return sessions, total


async def get_session(
    db: AsyncSession,
    user_id: str,
    session_id: UUID,
) -> ReadingSession | None:
    """Return a single session, verifying ownership."""
    result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.id == session_id,
            ReadingSession.user_id == user_id,
        ),
    )
    return result.scalar_one_or_none()


async def get_session_stats(db: AsyncSession, user_id: str) -> dict:
    """Return aggregate reading session statistics."""
    total_result = await db.execute(
        select(func.count()).select_from(ReadingSession).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_sessions = total_result.scalar() or 0

    duration_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_duration = duration_result.scalar() or 0

    pages_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.pages_read), 0)).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_pages_read = pages_result.scalar() or 0

    highlights_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.highlights), 0)).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_highlights = highlights_result.scalar() or 0

    notes_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.notes), 0)).where(
            ReadingSession.user_id == user_id,
        ),
    )
    total_notes = notes_result.scalar() or 0

    return {
        'total_sessions': int(total_sessions),
        'total_duration': int(total_duration),
        'total_pages_read': int(total_pages_read),
        'total_highlights': int(total_highlights),
        'total_notes': int(total_notes),
    }
