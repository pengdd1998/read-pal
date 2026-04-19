"""AI response feedback model — thumbs up/down from users."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class AIFeedback(Base):
    __tablename__ = 'ai_feedback'
    __table_args__ = (
        Index('ix_ai_feedback_user_id', 'user_id'),
        Index('ix_ai_feedback_book_id', 'book_id'),
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
    message_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rating: Mapped[bool] = mapped_column(Boolean, nullable=False)  # True=up, False=down
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    user: Mapped['User'] = relationship(
        'User',
        back_populates='ai_feedback',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='ai_feedback',
    )
