"""Notification business logic — list, mark read, create."""

import logging
from uuid import UUID

from app.utils import utcnow
from app.utils.time import utc_start_of_day

from sqlalchemy import and_, func, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

logger = logging.getLogger('read-pal.notifications')


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    type: str,
    title: str,
    message: str,
    metadata: dict | None = None,
) -> Notification | None:
    """Create a notification for a user.

    Adds the row to the session but does NOT flush/commit — the caller's
    transaction (e.g. the book-completion flush) persists it, so the
    notification is atomic with the event that triggered it and rolls back
    together if that event fails. Failures constructing the row are swallowed
    so a flaky notification never breaks the triggering action.
    """
    try:
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            metadata_=metadata or {},
        )
        db.add(notification)
        logger.info('Notification created: type=%s user=%s', type, user_id)
        return notification
    except (DBAPIError, OSError):
        logger.warning(
            'notification create failed: type=%s user=%s', type, user_id, exc_info=True,
        )
        return None


async def maybe_notify_daily_goal(
    db: AsyncSession,
    user_id: UUID,
    today_minutes: int,
    daily_goal_minutes: int,
) -> None:
    """Fire the 'daily reading goal achieved' notification, once per day.

    Called from end_session after recomputing today's minutes. No-op if the
    goal isn't met or if the user was already notified for it today (dedup via
    a JSONB metadata kind check). Best-effort: never blocks the session end.
    """
    if daily_goal_minutes <= 0 or today_minutes < daily_goal_minutes:
        return
    # Dedup: skip if we already notified for the daily goal today. Filter the
    # metadata kind in Python rather than via a JSONB query so the check works
    # on any backend (the PostgreSQL astext access isn't portable to SQLite).
    try:
        recent = await db.execute(
            select(Notification).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.type == 'goal_achieved',
                    Notification.created_at >= utc_start_of_day(),
                )
            )
        )
        for existing in recent.scalars():
            if (existing.metadata_ or {}).get('kind') == 'daily_goal':
                return
    except (DBAPIError, OSError):
        logger.warning('daily_goal dedup query failed user=%s', user_id, exc_info=True)
        return
    await create_notification(
        db,
        user_id,
        'goal_achieved',
        title='Daily reading goal achieved!',
        message=f"You've read {today_minutes} minutes today — goal reached. Nice work!",
        metadata={'kind': 'daily_goal', 'minutes': today_minutes, 'goal': daily_goal_minutes},
    )


async def list_notifications(
    db: AsyncSession,
    user_id: UUID,
    unread_only: bool = False,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Notification], int]:
    """List notifications for a user with optional unread filter."""
    filters = [Notification.user_id == user_id]
    if unread_only:
        filters.append(Notification.read == False)  # noqa: E712

    try:
        count_result = await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(*filters),
        )
        total = count_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await db.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(per_page),
        )
        return list(result.scalars().all()), total
    except (DBAPIError, OSError):
        logger.warning('notification list failed for user %s', user_id, exc_info=True)
        return [], 0


async def unread_count(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Get unread notification count."""
    try:
        result = await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read == False,  # noqa: E712
            ),
        )
        return result.scalar() or 0
    except (DBAPIError, OSError):
        logger.warning('notification unread_count failed for user %s', user_id, exc_info=True)
        return 0


async def mark_read(
    db: AsyncSession,
    user_id: UUID,
    notification_id: UUID,
) -> Notification | None:
    """Mark a single notification as read."""
    try:
        result = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            ),
        )
        notification = result.scalar_one_or_none()
    except (DBAPIError, OSError):
        logger.warning('notification mark_read failed: user=%s id=%s', user_id, notification_id, exc_info=True)
        return None
    if notification is None:
        return None

    notification.read = True
    await db.flush()
    await db.refresh(notification)
    logger.info('Notification marked read: id=%s user=%s', notification_id, user_id)
    return notification


async def mark_all_read(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Mark all unread notifications as read. Returns count updated."""
    try:
        result = await db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read == False,  # noqa: E712
            )
            .values(read=True, updated_at=utcnow())
            .returning(Notification.id),
        )
        rows = result.fetchall()
        await db.flush()
        logger.info('All notifications marked read: user=%s count=%d', user_id, len(rows))
        return len(rows)
    except (DBAPIError, OSError):
        logger.warning('notification mark_all_read failed for user %s', user_id, exc_info=True)
        return 0
