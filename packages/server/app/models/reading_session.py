"""Reading session model."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class ReadingSession(Base):
    __tablename__ = 'reading_sessions'
    __table_args__ = (
        Index(
            'ix_reading_sessions_user_id_is_active',
            'user_id',
            'is_active',
        ),
        Index(
            'ix_reading_sessions_user_id_book_id',
            'user_id',
            'book_id',
        ),
        Index(
            'ix_reading_sessions_user_id_started_at',
            'user_id',
            'started_at',
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
        index=True,
    )
    book_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )
    duration: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    pages_read: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    highlights: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    notes: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
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
        back_populates='reading_sessions',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='reading_sessions',
    )
