"""Collection model."""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Table, Column, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User

# Association table for the many-to-many relationship between collections and books.
collection_books = Table(
    'collection_books',
    Base.metadata,
    Column(
        'collection_id',
        PG_UUID(as_uuid=True),
        ForeignKey('collections.id', ondelete='CASCADE'),
        primary_key=True,
    ),
    Column(
        'book_id',
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        primary_key=True,
    ),
    Column(
        'added_at',
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    ),
)


class Collection(Base):
    __tablename__ = 'collections'

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
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    icon: Mapped[str] = mapped_column(String(255), default='folder')
    color: Mapped[str] = mapped_column(String(255), default='#f59e0b')
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda ctx: datetime.now(tz=timezone.utc),
    )

    user: Mapped['User'] = relationship('User', back_populates='collections')
    books: Mapped[list['Book']] = relationship(
        'Book',
        secondary=collection_books,
        backref='collections',
        lazy='selectin',
    )
