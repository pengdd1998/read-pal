"""Shared export business logic — create, retrieve, list, delete."""

import logging
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shared_export import SharedExport
from app.schemas.share import ShareCreate

logger = logging.getLogger('read-pal.share')

DEFAULT_EXPIRY_DAYS = 30


async def create_share(
    db: AsyncSession,
    user_id: UUID,
    data: ShareCreate,
) -> SharedExport:
    """Create a shared export with a secure token."""
    token = secrets.token_urlsafe(32)  # 256-bit entropy
    expires_at = data.expires_at or datetime.utcnow() + timedelta(
        days=DEFAULT_EXPIRY_DAYS,
    )

    share = SharedExport(
        user_id=user_id,
        book_id=data.book_id,
        token=token,
        format=data.format,
        title=data.title,
        content_type=data.content_type,
        content='',
        expires_at=expires_at,
    )
    db.add(share)
    await db.flush()
    await db.refresh(share)
    return share


async def get_share(
    db: AsyncSession,
    token: str,
) -> SharedExport | None:
    """Look up a share by token, check expiry, increment view count."""
    result = await db.execute(
        select(SharedExport).where(SharedExport.token == token),
    )
    share = result.scalar_one_or_none()
    if share is None:
        return None

    now = datetime.utcnow()
    if share.expires_at and share.expires_at < now:
        return None

    share.view_count = (share.view_count or 0) + 1
    await db.flush()
    await db.refresh(share)
    return share


async def list_shares(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
) -> list[SharedExport]:
    """List shares for a user, optionally filtered by book."""
    query = (
        select(SharedExport)
        .where(SharedExport.user_id == user_id)
        .order_by(SharedExport.created_at.desc()),
    )
    if book_id is not None:
        query = query.where(SharedExport.book_id == book_id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def delete_share(
    db: AsyncSession,
    user_id: UUID,
    share_id: UUID,
) -> None:
    """Delete a shared export. Verifies ownership."""
    result = await db.execute(
        select(SharedExport).where(
            SharedExport.id == share_id,
            SharedExport.user_id == user_id,
        ),
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise ValueError('Share not found')

    await db.delete(share)
    await db.flush()
