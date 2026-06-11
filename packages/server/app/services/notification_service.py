"""Notification business logic — list, mark read, create."""

import logging
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.notifications')


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
        async with db_error_guard('list_notifications', user_id=str(user_id)):
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
    except Exception:
        logger.debug('notification query failed', exc_info=True)
        return [], 0


async def unread_count(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Get unread notification count."""
    try:
        async with db_error_guard('unread_count', user_id=str(user_id)):
            result = await db.execute(
                select(func.count())
                .select_from(Notification)
                .where(
                    Notification.user_id == user_id,
                    Notification.read == False,  # noqa: E712
                ),
            )
            return result.scalar() or 0
    except Exception:
        logger.debug('notification query failed', exc_info=True)
        return 0


async def mark_read(
    db: AsyncSession,
    user_id: UUID,
    notification_id: UUID,
) -> Notification | None:
    """Mark a single notification as read."""
    try:
        async with db_error_guard('mark_read.query', user_id=str(user_id), notification_id=str(notification_id)):
            result = await db.execute(
                select(Notification).where(
                    Notification.id == notification_id,
                    Notification.user_id == user_id,
                ),
            )
            notification = result.scalar_one_or_none()
    except Exception:
        logger.debug('notification query failed', exc_info=True)
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
        async with db_error_guard('mark_all_read', user_id=str(user_id)):
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
    except Exception:
        logger.debug('notification query failed', exc_info=True)
        return 0
