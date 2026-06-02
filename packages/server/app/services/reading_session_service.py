"""Business logic for reading session operations."""

import json
import logging
from decimal import Decimal
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.models.reading_session import ReadingSession
from app.schemas.reading_session import SessionCreate, SessionUpdate

logger = logging.getLogger('read-pal.sessions')


def _stats_cache_key(uid: str) -> str:
    return f'stats:sessions:{uid}'


async def create_session(
    db: AsyncSession,
    user_id: str,
    data: SessionCreate,
) -> ReadingSession:
    """Create a new reading session, mark it active, update book status."""
    now = utcnow()
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
    await db.refresh(session)

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

    now = utcnow()
    session.ended_at = now
    session.is_active = False
    if not session.duration and session.started_at:
        session.duration = int((now - session.started_at).total_seconds())

    # Apply additional update fields if provided
    current_page_from_client = None
    total_pages_from_client = None
    scroll_progress_from_client = None
    current_segment_from_client = None
    if data:
        update_data = data.model_dump(exclude_unset=True)
        current_page_from_client = update_data.pop('current_page', None)
        total_pages_from_client = update_data.pop('total_pages', None)
        scroll_progress_from_client = update_data.pop('scroll_progress', None)
        current_segment_from_client = update_data.pop('current_segment', None)
        for field, value in update_data.items():
            if field != 'is_active':
                setattr(session, field, value)

    # Update book progress — only when client sends an explicit current_page.
    # The heartbeat and Client.tsx unload save handle progress tracking;
    # we avoid the old "add delta" logic that double-counted with heartbeat updates.
    if current_page_from_client is not None:
        book_result = await db.execute(
            select(Book).where(Book.id == session.book_id, Book.user_id == user_id),
        )
        book = book_result.scalar_one_or_none()
        if book:
            book.last_read_at = now
            if book.total_pages > 0:
                book.current_page = min(max(current_page_from_client, 0), book.total_pages)
                sp = scroll_progress_from_client if scroll_progress_from_client is not None else float(book.scroll_progress or 0)
                book.scroll_progress = Decimal(str(round(sp, 3)))
                if current_segment_from_client is not None:
                    book.current_segment = current_segment_from_client
                book.progress = Decimal(
                    str(round((book.current_page / book.total_pages) * 100, 2)),
                )
                if book.progress > Decimal('100'):
                    book.progress = Decimal('100')
                if book.current_page >= book.total_pages and book.status != BookStatus.completed:
                    book.progress = Decimal('100')
                    book.status = BookStatus.completed
                    book.completed_at = now
    elif scroll_progress_from_client is not None or current_segment_from_client is not None:
        # Only update scroll_progress/current_segment without changing current_page
        book_result = await db.execute(
            select(Book).where(Book.id == session.book_id, Book.user_id == user_id),
        )
        book = book_result.scalar_one_or_none()
        if book:
            book.last_read_at = now
            if scroll_progress_from_client is not None:
                book.scroll_progress = Decimal(str(round(scroll_progress_from_client, 3)))
            if current_segment_from_client is not None:
                book.current_segment = current_segment_from_client

    await db.flush()
    return session


async def get_active_session(
    db: AsyncSession,
    user_id: str,
    book_id: UUID | None = None,
) -> ReadingSession | None:
    """Find the active session for a given book, or any active session."""
    conditions = [
        ReadingSession.user_id == user_id,
        ReadingSession.is_active == True,  # noqa: E712
    ]
    if book_id is not None:
        conditions.append(ReadingSession.book_id == book_id)
    result = await db.execute(
        select(ReadingSession).where(*conditions),
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
    """Return aggregate reading session statistics (cached 5 min, single query)."""
    from app.core.redis import get_redis

    try:
        redis = get_redis()
        cached = await redis.get(_stats_cache_key(user_id))
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    row = (await db.execute(
        select(
            func.count().label('sessions'),
            func.coalesce(func.sum(ReadingSession.duration), 0).label('duration'),
            func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
            func.coalesce(func.sum(ReadingSession.highlights), 0).label('highlights'),
            func.coalesce(func.sum(ReadingSession.notes), 0).label('notes'),
        ).where(ReadingSession.user_id == user_id)
    )).one()

    result = {
        'total_sessions': int(row.sessions),
        'total_duration': int(row.duration),
        'total_pages_read': int(row.pages),
        'total_highlights': int(row.highlights),
        'total_notes': int(row.notes),
    }

    try:
        redis = get_redis()
        await redis.setex(_stats_cache_key(user_id), 300, json.dumps(result))
    except Exception:
        pass

    return result


async def heartbeat_session(
    db: AsyncSession,
    user_id: UUID,
    session_id: UUID,
    body: 'HeartbeatRequest | None' = None,
) -> ReadingSession | None:
    """Update session activity timestamp and book progress on heartbeat."""
    from app.schemas.reading_session import HeartbeatRequest  # noqa: F811

    result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.id == session_id,
            ReadingSession.user_id == user_id,
        ),
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None

    session.updated_at = utcnow()
    if body:
        pages_read = body.pages_read or body.pagesRead
        if pages_read is not None:
            session.pages_read = int(pages_read)
        scroll_progress = body.scroll_progress or body.scrollProgress
        current_segment = body.current_segment
        if scroll_progress is not None or current_segment is not None:
            book_result = await db.execute(
                select(Book).where(Book.id == session.book_id, Book.user_id == user_id),
            )
            book = book_result.scalar_one_or_none()
            if book and book.total_pages > 0:
                if scroll_progress is not None:
                    book.scroll_progress = Decimal(str(round(scroll_progress, 3)))
                if current_segment is not None:
                    book.current_segment = current_segment
                pages_read_val = int(pages_read or session.pages_read or 0)
                heartbeat_page = max(0, min(pages_read_val - 1, book.total_pages))
                if heartbeat_page > book.current_page:
                    book.current_page = heartbeat_page
                    book.progress = Decimal(
                        str(round((book.current_page / book.total_pages) * 100, 2)),
                    )
                    if book.progress > Decimal('100'):
                        book.progress = Decimal('100')
                    if book.current_page >= book.total_pages and book.status != BookStatus.completed:
                        book.progress = Decimal('100')
                        book.status = BookStatus.completed
                        book.completed_at = utcnow()
    await db.flush()
    return session


def build_session_summary(session: ReadingSession) -> str:
    """Build a human-readable summary of a reading session."""
    duration_min = (session.duration or 0) // 60
    pages = session.pages_read or 0
    highlights = session.highlights or 0
    notes = session.notes or 0

    parts = []
    if duration_min > 0:
        parts.append(f'Read for {duration_min} minute{"s" if duration_min != 1 else ""}')
    if pages > 0:
        parts.append(f'covered {pages} page{"s" if pages != 1 else ""}')
    if highlights > 0:
        parts.append(f'made {highlights} highlight{"s" if highlights != 1 else ""}')
    if notes > 0:
        parts.append(f'wrote {notes} note{"s" if notes != 1 else ""}')

    if parts:
        return 'You ' + ', and '.join([
            ', '.join(parts[:-1]),
            parts[-1],
        ]) + '.' if len(parts) > 1 else parts[0] + '.'
    return 'Session recorded successfully.'


async def get_book_session_log(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[ReadingSession], int]:
    """Return paginated session log for a specific book."""
    base_filter = (
        ReadingSession.user_id == user_id,
        ReadingSession.book_id == book_id,
    )
    total = await db.scalar(
        select(func.count(ReadingSession.id)).where(*base_filter),
    ) or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(ReadingSession)
        .where(*base_filter)
        .order_by(ReadingSession.started_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    return list(result.scalars().all()), total
