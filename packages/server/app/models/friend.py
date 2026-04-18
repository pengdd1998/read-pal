"""Friend conversation and relationship models."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.user import User

VALID_PERSONAS = ('sage', 'penny', 'alex', 'quinn', 'sam')


class FriendConversation(Base):
    __tablename__ = 'friend_conversations'
    __table_args__ = (
        Index('ix_friend_conv_user_created', 'user_id', 'created_at'),
        Index('ix_friend_conv_user_persona', 'user_id', 'persona'),
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
    )
    persona: Mapped[str] = mapped_column(String(20), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    emotion: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped['User'] = relationship(
        'User',
        back_populates='friend_conversations',
    )


class FriendRelationship(Base):
    __tablename__ = 'friend_relationships'

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        unique=True,
        nullable=False,
    )
    persona: Mapped[str] = mapped_column(String(20), default='sage')
    books_read_together: Mapped[int] = mapped_column(Integer, default=0)
    shared_moments: Mapped[list] = mapped_column(JSONB, default=[])
    total_messages: Mapped[int] = mapped_column(Integer, default=0)
    last_interaction_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped['User'] = relationship(
        'User',
        back_populates='friend_relationship',
    )
