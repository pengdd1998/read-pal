"""Chat history service — query and serialize chat messages.

Provides:
- ``get_chat_history`` — backwards-compatible flat list (used by /history)
- ``get_chat_history_page`` — cursor-paginated (P1-5)
- ``load_history_messages`` — shared loader used by both the companion
  context loader and the history endpoints so behavior stays in sync
  (P1-7: DRY history loading).

All three filter out soft-deleted rows (``deleted_at IS NULL``) so the
regenerate flow (P1-6) cleanly hides the discarded assistant message.
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage
from app.utils.db import db_error_guard
from app.utils.limits import CHAT_HISTORY_DEFAULT_LIMIT

logger = logging.getLogger('read-pal.chat')

_ACTIVE_FILTER = ChatMessage.deleted_at.is_(None)


async def load_history_messages(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
    *,
    limit: int = CHAT_HISTORY_DEFAULT_LIMIT,
    before_id: UUID | None = None,
    include_deleted: bool = False,
) -> list[ChatMessage]:
    """Return raw ChatMessage rows for a user (and optionally a book).

    Shared between companion-context loading and the history endpoints so
    ordering, soft-delete filtering, and pagination stay consistent.

    - Ordered by ``created_at DESC`` (most-recent first).
    - When ``before_id`` is provided, only rows with ``created_at`` strictly
      older than that row are returned (cursor pagination).
    - When ``include_deleted`` is False, soft-deleted rows are excluded.
    """
    q = select(ChatMessage).where(ChatMessage.user_id == user_id)
    if book_id is not None:
        q = q.where(ChatMessage.book_id == book_id)
    if not include_deleted:
        q = q.where(_ACTIVE_FILTER)
    if before_id is not None:
        # Subquery lookup of the cursor row's created_at. We don't trust
        # client-supplied timestamps; the id is the source of truth.
        cursor_subq = (
            select(ChatMessage.created_at)
            .where(ChatMessage.id == before_id, ChatMessage.user_id == user_id)
            .scalar_subquery()
        )
        q = q.where(ChatMessage.created_at < cursor_subq)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    async with db_error_guard('chat_service.load_history_messages'):
        result = await db.execute(q)
        return list(result.scalars().all())


def _serialize_message(m: ChatMessage) -> dict:
    """Serialize a ChatMessage to the public API shape (camelCase)."""
    return {
        'id': str(m.id),
        'bookId': str(m.book_id),
        'role': m.role,
        'content': m.content,
        'createdAt': m.created_at.isoformat() if m.created_at else None,
    }


async def get_chat_history(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
    limit: int = CHAT_HISTORY_DEFAULT_LIMIT,
) -> list[dict]:
    """Return chat messages for a user, optionally filtered by book.

    Backwards-compatible flat list (no cursor). Filters out soft-deleted rows.
    Assistant messages carry ``myRating`` (True/False/None) so the UI can
    re-render the user's previous thumbs state after a reload.
    """
    rows = await load_history_messages(db, user_id, book_id, limit=limit)
    serialized = [_serialize_message(m) for m in rows]

    from sqlalchemy import select

    from app.models.ai_feedback import AIFeedback

    assistant_ids = [m['id'] for m in serialized if m['role'] == 'assistant']
    if assistant_ids:
        rating_rows = (await db.execute(
            select(AIFeedback.message_id, AIFeedback.rating).where(
                AIFeedback.user_id == user_id,
                AIFeedback.message_id.in_(assistant_ids),
            )
        )).all()
        by_message = {str(mid): rating for mid, rating in rating_rows}
        for m in serialized:
            if m['role'] == 'assistant':
                m['myRating'] = by_message.get(m['id'])
    return serialized


async def get_chat_history_page(
    db: AsyncSession,
    user_id: UUID,
    *,
    book_id: UUID | None = None,
    limit: int = CHAT_HISTORY_DEFAULT_LIMIT,
    before_id: UUID | None = None,
) -> dict:
    """Cursor-paginated chat history.

    Returns ``{items, nextCursor}`` where ``nextCursor`` is the id of the
    oldest item in the page if more rows likely exist (None otherwise).
    """
    # Fetch one extra row to detect whether another page exists without a
    # separate COUNT query.
    rows = await load_history_messages(
        db, user_id, book_id,
        limit=limit + 1, before_id=before_id,
    )
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    items = [_serialize_message(m) for m in rows]
    next_cursor = items[-1]['id'] if has_more and items else None
    return {'items': items, 'nextCursor': next_cursor}
