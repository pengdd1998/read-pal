"""Reading plan model — AI-generated reading schedules."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class ReadingPlan(Base):
    __tablename__ = 'reading_plans'
    __table_args__ = (
        Index('ix_reading_plans_user_book', 'user_id', 'book_id'),
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
    plan_text: Mapped[str] = mapped_column(Text, nullable=False)
    total_days: Mapped[int] = mapped_column(Integer, default=7)
    current_day: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    user: Mapped['User'] = relationship(
        'User',
        back_populates='reading_plans',
    )
    book: Mapped['Book'] = relationship(
        'Book',
        back_populates='reading_plans',
    )
