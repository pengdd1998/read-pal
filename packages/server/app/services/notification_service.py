"""Notification business logic — list, mark read, create."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

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


async def unread_count(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Get unread notification count."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read == False,  # noqa: E712
        ),
    )
    return result.scalar() or 0


async def mark_read(
    db: AsyncSession,
    user_id: UUID,
    notification_id: UUID,
) -> Notification | None:
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        ),
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        return None

    notification.read = True
    await db.flush()
    await db.refresh(notification)
    return notification


async def mark_all_read(
    db: AsyncSession,
    user_id: UUID,
) -> int:
    """Mark all unread notifications as read. Returns count updated."""
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read == False,  # noqa: E712
        )
        .values(read=True, updated_at=datetime.now(timezone.utc))
        .returning(Notification.id),
    )
    rows = result.fetchall()
    await db.flush()
    return len(rows)


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    type: str,
    title: str,
    message: str,
    metadata: dict | None = None,
) -> Notification:
    """Internal helper: create a notification."""
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        metadata_=metadata,
    )
    db.add(notification)
    await db.flush()
    await db.refresh(notification)
    return notification
