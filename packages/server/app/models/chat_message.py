"""Chat message model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    __table_args__ = (
        Index(
            'ix_chat_messages_user_id_book_id',
            'user_id',
            'book_id',
        ),
        Index(
            'ix_chat_messages_user_id_created_at',
            'user_id',
            'created_at',
        ),
        Index(
            'ix_chat_messages_user_id_book_id_created_at',
            'user_id',
            'book_id',
            'created_at',
        ),
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
    role: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )

    # relationships
    user: Mapped['User'] = relationship(
        'User',
        back_populates='chat_messages',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='chat_messages',
    )
