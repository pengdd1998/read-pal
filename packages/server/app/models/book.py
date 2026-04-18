"""Book model."""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.annotation import Annotation
    from app.models.chat_message import ChatMessage
    from app.models.document import Document
    from app.models.flashcard import Flashcard
    from app.models.memory_book import MemoryBook
    from app.models.reading_session import ReadingSession
    from app.models.shared_export import SharedExport
    from app.models.user import User


class BookFileType(PyEnum):
    epub = 'epub'
    pdf = 'pdf'


class BookStatus(PyEnum):
    unread = 'unread'
    reading = 'reading'
    completed = 'completed'


class Book(Base):
    __tablename__ = 'books'
    __table_args__ = (
        Index('ix_books_user_id_status', 'user_id', 'status'),
        Index('ix_books_tags_gin', 'tags', postgresql_using='gin'),
        Index(
            'ix_books_user_id_last_read_at',
            'user_id',
            'last_read_at',
        ),
        Index('ix_books_user_id_added_at', 'user_id', 'added_at'),
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
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    author: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    cover_url: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    file_type: Mapped[str] = mapped_column(
        Enum(
            BookFileType,
            name='book_file_type_enum',
            values_callable=lambda e: [x.value for x in e],
        ),
        nullable=False,
        index=True,
    )
    file_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    total_pages: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    current_page: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    progress: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal('0'),
    )
    status: Mapped[str] = mapped_column(
        Enum(
            BookStatus,
            name='book_status_enum',
            values_callable=lambda e: [x.value for x in e],
        ),
        default=BookStatus.unread,
        index=True,
    )
    tags: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(String),
        default=[],
    )
    added_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )
    last_read_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        'metadata',
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    user: Mapped['User'] = relationship(
        'User',
        back_populates='books',
    )
    annotations: Mapped[list['Annotation']] = relationship(
        'Annotation',
        back_populates='book',
        cascade='all, delete-orphan',
    )
    reading_sessions: Mapped[list['ReadingSession']] = relationship(
        'ReadingSession',
        back_populates='book',
        cascade='all, delete-orphan',
    )
    memory_book: Mapped[Optional['MemoryBook']] = relationship(
        'MemoryBook',
        back_populates='book',
        cascade='all, delete-orphan',
        uselist=False,
    )
    chat_messages: Mapped[list['ChatMessage']] = relationship(
        'ChatMessage',
        back_populates='book',
        cascade='all, delete-orphan',
    )
    flashcards: Mapped[list['Flashcard']] = relationship(
        'Flashcard',
        back_populates='book',
        cascade='all, delete-orphan',
    )
    shared_exports: Mapped[list['SharedExport']] = relationship(
        'SharedExport',
        back_populates='book',
        cascade='all, delete-orphan',
    )
    document: Mapped[Optional['Document']] = relationship(
        'Document',
        back_populates='book',
        cascade='all, delete-orphan',
        uselist=False,
    )
