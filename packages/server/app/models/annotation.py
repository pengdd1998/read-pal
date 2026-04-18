"""Annotation model."""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.flashcard import Flashcard
    from app.models.user import User


class AnnotationType(PyEnum):
    highlight = 'highlight'
    note = 'note'
    bookmark = 'bookmark'


class Annotation(Base):
    __tablename__ = 'annotations'
    __table_args__ = (
        Index('ix_annotations_tags_gin', 'tags', postgresql_using='gin'),
        Index(
            'ix_annotations_user_id_book_id',
            'user_id',
            'book_id',
        ),
        Index(
            'ix_annotations_user_id_book_id_created_at',
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
        index=True,
    )
    book_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        Enum(
            AnnotationType,
            name='annotation_type_enum',
            values_callable=lambda e: [x.value for x in e],
        ),
        nullable=False,
        index=True,
    )
    location: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    color: Mapped[Optional[str]] = mapped_column(
        String(7),
        nullable=True,
    )
    note: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    tags: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(String),
        nullable=True,
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
        back_populates='annotations',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='annotations',
    )
    flashcards: Mapped[list['Flashcard']] = relationship(
        'Flashcard',
        back_populates='annotation',
    )
