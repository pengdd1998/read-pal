"""AI response feedback model — thumbs up/down from users."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.chat_message import ChatMessage
    from app.models.user import User


class AIFeedback(Base):
    __tablename__ = 'ai_feedback'
    __table_args__ = (
        Index('ix_ai_feedback_user_id', 'user_id'),
        Index('ix_ai_feedback_book_id', 'book_id'),
        Index('ix_ai_feedback_message_id', 'message_id'),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    book_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        nullable=False,
    )
    # Real FK to chat_messages.id with CASCADE so feedback is cleaned up
    # alongside its target message (e.g., on regenerate soft-delete purge
    # or book deletion). Nullable for legacy rows and for ratings given
    # in flows that don't have a single message anchor.
    message_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('chat_messages.id', ondelete='CASCADE'),
        nullable=True,
    )
    rating: Mapped[bool] = mapped_column(Boolean, nullable=False)  # True=up, False=down
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    user: Mapped['User'] = relationship(
        'User',
        back_populates='ai_feedback',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='ai_feedback',
    )
    message: Mapped[Optional['ChatMessage']] = relationship(
        'ChatMessage',
    )
