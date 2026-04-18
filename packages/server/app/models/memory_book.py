"""Memory book model."""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class MemoryBookFormat(PyEnum):
    scrapbook = 'scrapbook'
    journal = 'journal'
    timeline = 'timeline'
    podcast = 'podcast'
    personal_book = 'personal_book'


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
        Enum(
            MemoryBookFormat,
            name='memory_book_format_enum',
            values_callable=lambda e: [x.value for x in e],
        ),
        default=MemoryBookFormat.scrapbook,
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
    html_content: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    generated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
    )
    created_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
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
