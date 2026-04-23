"""Shared export business logic — create, retrieve, list, delete."""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shared_export import SharedExport
from app.schemas.share import ShareCreate
from app.services.export_service import export

logger = logging.getLogger('read-pal.share')

DEFAULT_EXPIRY_DAYS = 30


async def create_share(
    db: AsyncSession,
    user_id: UUID,
    data: ShareCreate,
) -> SharedExport:
    """Create a shared export with a secure token and actual content."""
    token = secrets.token_urlsafe(32)  # 256-bit entropy
    expires_at = data.expires_at or utcnow() + timedelta(
        days=DEFAULT_EXPIRY_DAYS,
    )

    # Generate actual export content
    content = ''
    content_type = data.content_type
    try:
        result = await export(db, user_id, data.book_id, data.format)
        if result is not None:
            content, content_type = result
            if isinstance(content, bytes):
                content = content.decode('utf-8', errors='replace')
    except Exception:
        logger.warning('Failed to generate export content for share', exc_info=True)

    share = SharedExport(
        user_id=user_id,
        book_id=data.book_id,
        token=token,
        format=data.format,
        title=data.title,
        content_type=content_type,
        content=content,
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

    now = utcnow()
    if share.expires_at:
        # Normalize to naive UTC for comparison
        exp = share.expires_at
        if exp.tzinfo is not None:
            exp = exp.replace(tzinfo=None)
        if exp < now:
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
        .order_by(SharedExport.created_at.desc())
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
