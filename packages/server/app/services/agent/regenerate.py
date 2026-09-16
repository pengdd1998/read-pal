"""Regenerate-domain service (M3.1 extraction from routers/agent.py).

The router kept this ChatMessage query/update inline — the only direct-DB
block in any router, grandfathered by the check_router_thin exemption.
Moved here so the exemption list can be emptied and the thin-router rule
is mechanically total.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage

logger = logging.getLogger('read-pal.agent.regenerate')


async def pop_last_exchange_for_regeneration(
    db: AsyncSession, user_id: UUID, book_id: UUID,
) -> ChatMessage:
    """Soft-delete the last assistant reply and return the user message
    to regenerate from.

    Finds the most recent non-deleted user message and the assistant
    message right after it (if any). The assistant reply gets
    ``deleted_at=NOW()`` (preserved for audit) so the re-stream sees a
    clean history. Raises 404 NO_HISTORY / NO_USER_MESSAGE when there is
    nothing to regenerate from.
    """
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.user_id == user_id,
            ChatMessage.book_id == book_id,
            ChatMessage.deleted_at.is_(None),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(2)
    )
    last_two = list(result.scalars().all())  # newest first
    if not last_two:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NO_HISTORY', 'message': 'No user message to regenerate from.'},
        )

    last_msg = last_two[0]
    if last_msg.role == 'assistant':
        # Soft-delete the last assistant message; the user message is now last_two[1]
        await db.execute(
            update(ChatMessage)
            .where(ChatMessage.id == last_msg.id)
            .values(deleted_at=datetime.now(UTC))
        )
        user_msg = last_two[1] if len(last_two) > 1 else None
    else:
        user_msg = last_msg

    if user_msg is None or user_msg.role != 'user':
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={'code': 'NO_USER_MESSAGE', 'message': 'No user message to regenerate from.'},
        )
    return user_msg
