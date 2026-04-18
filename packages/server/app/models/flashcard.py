"""Flashcard model."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.annotation import Annotation
    from app.models.book import Book
    from app.models.user import User


class Flashcard(Base):
    __tablename__ = 'flashcards'
    __table_args__ = (
        CheckConstraint(
            'last_rating >= 0 AND last_rating <= 5',
            name='ck_flashcards_last_rating_range',
        ),
        Index(
            'ix_flashcards_user_id_next_review_at',
            'user_id',
            'next_review_at',
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
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
    annotation_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('annotations.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    ease_factor: Mapped[float] = mapped_column(
        Float,
        default=2.5,
    )
    interval: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    repetition_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )
    next_review_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    last_review_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )
    last_rating: Mapped[Optional[int]] = mapped_column(
        Integer,
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
        back_populates='flashcards',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='flashcards',
    )
    annotation: Mapped[Optional['Annotation']] = relationship(
        'Annotation',
        back_populates='flashcards',
    )
