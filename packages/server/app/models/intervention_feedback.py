"""Intervention feedback model."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class InterventionFeedback(Base):
    __tablename__ = 'intervention_feedback'

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
    book_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='SET NULL'),
        nullable=True,
    )
    intervention_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    helpful: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped['User'] = relationship(
        'User',
        back_populates='intervention_feedback',
    )
    book: Mapped[Optional['Book']] = relationship('Book')
