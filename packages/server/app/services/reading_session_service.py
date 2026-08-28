"""Business logic for reading session operations.

Public API is re-exported from sub-modules so existing imports
(`from app.services import reading_session_service`) continue to work.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.book import Book
    from app.schemas.reading_session import HeartbeatRequest

import logging
from datetime import timedelta
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession
from app.schemas.reading_session import SessionCreate, SessionUpdate
from app.utils.db import db_error_guard

# Re-export from extracted sub-modules
from app.services._session_book_progress import (  # noqa: F401
    cap_progress as _cap_progress,
    update_book_completion as _update_book_completion,
    update_book_heartbeat as _update_book_heartbeat,
    update_book_scroll_only as _update_book_scroll_only,
    update_book_with_page as _update_book_with_page,
)
from app.services._session_helpers import (
    MAX_SESSION_SECONDS as _MAX_SESSION_SECONDS,
    STALE_IDLE_GRACE_SECONDS as _STALE_IDLE_GRACE_SECONDS,
    apply_update_fields as _apply_update_fields,
    clamp_client_duration as _clamp_client_duration,
    extract_client_fields as _extract_client_fields,
    finalize_session_duration as _finalize_session_duration,
    resolve_heartbeat_pages as _resolve_heartbeat_pages,
)
from app.services._session_queries import (  # noqa: F401
    get_active_session,
    get_book_session_log,
    get_session,
    get_sessions,
)
from app.services._session_stats import get_session_stats  # noqa: F401
from app.services._session_summary import build_session_summary  # noqa: F401

logger = logging.getLogger('read-pal.sessions')


# ---------------------------------------------------------------------------
# Session mutations (create / end / heartbeat)
# ---------------------------------------------------------------------------


async def _verify_book_ownership(
    db: AsyncSession,
    book_id,
    user_id: str,
) -> Book:
    """Return the book if it exists and belongs to the user, else raise 404."""
    from fastapi import HTTPException, status as http_status
    from app.models.book import Book

    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail={'code': 'NOT_FOUND', 'message': 'Book not found'},
        )
    return book


# When closing a stale session (e.g. user re-opened the book or a different
# tab), we don't know exactly when they stopped reading. Use the last
# heartbeat timestamp plus this grace window as the effective end — a stale
# session open for hours with no heartbeat shouldn't accrue hours of duration.
STALE_IDLE_GRACE_SECONDS = _STALE_IDLE_GRACE_SECONDS  # re-export for callers


async def _close_stale_sessions(
    db: AsyncSession,
    user_id: str,
    book_id,
    now,
) -> None:
    """Close any existing active sessions for this user+book.

    Effective end time is capped to last heartbeat + grace so duration
    reflects actual reading, not idle wall-clock since the last heartbeat.
    """
    stale = await db.execute(
        select(ReadingSession).where(
            ReadingSession.user_id == user_id,
            ReadingSession.book_id == book_id,
            ReadingSession.is_active.is_(True),
        ),
    )
    for old in stale.scalars().all():
        old.is_active = False
        # updated_at tracks the last heartbeat. If the user closed the tab
        # hours ago, ended_at should reflect that, not the current time.
        last_activity = old.updated_at or old.started_at or now
        effective_end = min(
            now,
            last_activity + timedelta(seconds=STALE_IDLE_GRACE_SECONDS),
        )
        old.ended_at = effective_end
        # Always clamp the duration (whether pre-existing from a client
        # report or freshly computed) so a stale session can't retain an
        # inflated value. The helper applies the same effective_end bound
        # used above plus the absolute MAX_SESSION_SECONDS cap.
        if old.started_at:
            raw_dur = max(0, int((effective_end - old.started_at).total_seconds()))
            realistic_ceiling = min(raw_dur, _MAX_SESSION_SECONDS)
            old.duration = min(int(old.duration or 0), realistic_ceiling) if old.duration else realistic_ceiling


def _mark_book_reading(book: Book, now) -> None:
    """Update book status to 'reading' if not already."""
    from app.models.book import BookStatus

    if book.status != BookStatus.reading:
        book.status = BookStatus.reading
        if book.started_at is None:
            book.started_at = now


async def create_session(
    db: AsyncSession,
    user_id: str,
    data: SessionCreate,
) -> ReadingSession:
    """Create a new reading session, close stale ones, update book status."""
    from fastapi import HTTPException, status as http_status
    from sqlalchemy.exc import IntegrityError

    now = utcnow()

    book = await _verify_book_ownership(db, data.book_id, user_id)
    await _close_stale_sessions(db, user_id, data.book_id, now)

    session = ReadingSession(
        user_id=user_id,
        book_id=data.book_id,
        started_at=data.started_at or now,
        is_active=True,
    )
    db.add(session)
    _mark_book_reading(book, now)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail={'code': 'SESSION_CONFLICT', 'message': 'An active session already exists for this book'},
        ) from None

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
    async with db_error_guard(
        'end_session',
        user_id=user_id, session_id=str(session_id),
    ):
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
        # Defensive clamp: client-reported duration may be inflated due to
        # stale session timers, cross-tab drift, or paused-but-unmounted state.
        # Bound it to the realistic wall-clock window (last heartbeat + grace),
        # matching the logic in finalize_session_duration / _close_stale_sessions.
        if 'duration' in update_data:
            update_data['duration'] = _clamp_client_duration(
                session, int(update_data['duration'] or 0), now,
            )
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

        # Best-effort gamification: notify when today's reading crosses the
        # daily-minute goal. Fires at most once per day (dedup in the helper).
        # Local imports avoid a module-load cycle with notification/settings.
        try:
            from app.models.user import User
            from app.services.notification_service import maybe_notify_daily_goal
            from app.services.settings_service import _get_today_reading_minutes

            user = await db.scalar(select(User).where(User.id == user_id))
            if user is not None:
                goals = (user.settings or {}).get('readingGoals', {})
                daily_goal = int(goals.get('dailyMinutes', 30) or 30)
                today_minutes = await _get_today_reading_minutes(db, user_id)
                await maybe_notify_daily_goal(db, user_id, today_minutes, daily_goal)
        except Exception:
            logger.warning('daily_goal notification check failed', exc_info=True)
    return session


async def heartbeat_session(
    db: AsyncSession,
    user_id: UUID,
    session_id: UUID,
    body: HeartbeatRequest | None = None,
) -> ReadingSession | None:
    """Update session activity timestamp and book progress on heartbeat."""
    async with db_error_guard(
        'heartbeat_session',
        user_id=str(user_id), session_id=str(session_id),
    ):
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
