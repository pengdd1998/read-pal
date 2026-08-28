"""Memory book model."""

import uuid
from datetime import datetime, UTC
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class MemoryBook(Base):
    __tablename__ = 'memory_books'
    __table_args__ = (
        UniqueConstraint('user_id', 'book_id', name='uq_memory_books_user_book'),
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
        index=True,
    )
    book_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    format: Mapped[str] = mapped_column(
        String(20),
        default='personal_book',
    )
    moments: Mapped[list] = mapped_column(
        JSONB,
        server_default=text("'[]'"),
    )
    insights: Mapped[list] = mapped_column(
        JSONB,
        server_default=text("'[]'"),
    )
    stats: Mapped[dict] = mapped_column(
        JSONB,
        server_default=text("'{}'"),
    )
    sections: Mapped[list] = mapped_column(
        JSONB,
        server_default=text("'[]'"),
    )
    html_content: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text('1'),
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=UTC),
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=UTC),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda ctx: datetime.now(tz=UTC),
    )

    # relationships
    user: Mapped['User'] = relationship(
        'User',
        back_populates='memory_books',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='memory_book',
    )
