"""Read-only query functions for reading session operations.

All functions are pure reads (no writes/flushes) and can be used
independently from the mutation logic in reading_session_service.
"""

import asyncio
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession


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
