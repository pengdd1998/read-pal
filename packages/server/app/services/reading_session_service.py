"""Business logic for reading session operations.

Public API is re-exported from sub-modules so existing imports
(`from app.services import reading_session_service`) continue to work.
"""

import asyncio
import logging
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession
from app.schemas.reading_session import SessionCreate, SessionUpdate

# Re-export from extracted sub-modules
from app.services._session_book_progress import (  # noqa: F401
    cap_progress as _cap_progress,
    update_book_completion as _update_book_completion,
    update_book_heartbeat as _update_book_heartbeat,
    update_book_scroll_only as _update_book_scroll_only,
    update_book_with_page as _update_book_with_page,
)
from app.services._session_stats import get_session_stats  # noqa: F401
from app.services._session_summary import build_session_summary  # noqa: F401

logger = logging.getLogger('read-pal.sessions')


# ---------------------------------------------------------------------------
# Small internal helpers
# ---------------------------------------------------------------------------


def _extract_client_fields(
    data: SessionUpdate | None,
) -> tuple[dict, int | None, float | None, str | None]:
    """Extract client-side fields and remaining update data from SessionUpdate."""
    current_page: int | None = None
    scroll_progress: float | None = None
    current_segment: str | None = None
    if not data:
        return {}, current_page, scroll_progress, current_segment
    update_data = data.model_dump(exclude_unset=True)
    current_page = update_data.pop('current_page', None)
    update_data.pop('total_pages', None)
    scroll_progress = update_data.pop('scroll_progress', None)
    current_segment = update_data.pop('current_segment', None)
    return update_data, current_page, scroll_progress, current_segment


def _apply_update_fields(session: ReadingSession, update_data: dict) -> None:
    """Set updateable fields on a session from a dict, skipping is_active."""
    for field, value in update_data.items():
        if field != 'is_active':
            setattr(session, field, value)


# Maximum reasonable duration for a single reading session (2 hours).
# Sessions exceeding this are likely idle tabs, not active reading.
_MAX_SESSION_SECONDS = 7200


def _finalize_session_duration(session: ReadingSession, now) -> None:
    """Compute and set session duration if not already set.

    Prefers client-reported duration (which excludes paused time) over
    wall-clock computation from timestamps. Caps wall-clock fallback
    to avoid inflated durations from idle tabs.
    """
    if not session.duration and session.started_at:
        raw = int((now - session.started_at).total_seconds())
        session.duration = min(raw, _MAX_SESSION_SECONDS)


def _resolve_heartbeat_pages(body) -> tuple[int | None, float | None, str | None]:
    """Extract page/scroll/segment fields from heartbeat body."""
    pages_read = body.pages_read or body.pagesRead
    scroll_progress = body.scroll_progress or body.scrollProgress
    current_segment = body.current_segment
    return pages_read, scroll_progress, current_segment


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------


async def create_session(
    db: AsyncSession,
    user_id: str,
    data: SessionCreate,
) -> ReadingSession:
    """Create a new reading session, close stale ones, update book status."""
    from app.models.book import Book, BookStatus

    # Close any existing active sessions for this user+book
    now = utcnow()
    stale = await db.execute(
        select(ReadingSession).where(
            ReadingSession.user_id == user_id,
            ReadingSession.book_id == data.book_id,
            ReadingSession.is_active.is_(True),
        ),
    )
    for old in stale.scalars().all():
        old.is_active = False
        old.ended_at = now
        if not old.duration and old.started_at:
            raw_dur = int((now - old.started_at).total_seconds())
            old.duration = min(raw_dur, _MAX_SESSION_SECONDS)
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
    if not session.is_active:
        return session

    now = utcnow()
    session.ended_at = now
    session.is_active = False
    _finalize_session_duration(session, now)

    update_data, current_page, scroll_progress, current_segment = _extract_client_fields(data)
    _apply_update_fields(session, update_data)

    if current_page is not None:
        await _update_book_with_page(
            db, session.book_id, user_id, now,
            current_page, scroll_progress, current_segment,
        )
    elif scroll_progress is not None or current_segment is not None:
        await _update_book_scroll_only(
            db, session.book_id, user_id, now,
            scroll_progress, current_segment,
        )

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

    offset = (page - 1) * per_page
    total_result, result = await asyncio.gather(
        db.execute(count_base),
        db.execute(
            base.order_by(ReadingSession.started_at.desc())
            .offset(offset)
            .limit(per_page),
        ),
    )
    total = total_result.scalar() or 0
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


async def heartbeat_session(
    db: AsyncSession,
    user_id: UUID,
    session_id: UUID,
    body: 'HeartbeatRequest | None' = None,
) -> ReadingSession | None:
    """Update session activity timestamp and book progress on heartbeat."""
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
        pages_read, scroll_progress, current_segment = _resolve_heartbeat_pages(body)
        if pages_read is not None:
            session.pages_read = int(pages_read)
        if scroll_progress is not None or current_segment is not None:
            await _update_book_heartbeat(
                db, session.book_id, user_id,
                pages_read, session.pages_read,
                scroll_progress, current_segment,
            )
    await db.flush()
    return session


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
