"""Chat history service — query and serialize chat messages."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage


async def get_chat_history(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return chat messages for a user, optionally filtered by book."""
    q = select(ChatMessage).where(ChatMessage.user_id == user_id)
    if book_id:
        q = q.where(ChatMessage.book_id == book_id)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    result = await db.execute(q)
    messages = list(result.scalars().all())
    return [
        {
            'id': str(m.id),
            'bookId': str(m.book_id),
            'role': m.role,
            'content': m.content,
            'createdAt': m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]
