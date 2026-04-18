"""Webhook and delivery log models."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.user import User

VALID_WEBHOOK_EVENTS = (
    'annotation.created',
    'annotation.updated',
    'annotation.deleted',
    'book.started',
    'book.completed',
    'book.updated',
    'session.started',
    'session.ended',
    'flashcard.created',
    'flashcard.reviewed',
)


class Webhook(Base):
    __tablename__ = 'webhooks'

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
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    events: Mapped[list] = mapped_column(JSONB, default=[])
    secret: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_delivery_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_delivery_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped['User'] = relationship('User', back_populates='webhooks')
    delivery_logs: Mapped[list['WebhookDeliveryLog']] = relationship(
        'WebhookDeliveryLog',
        back_populates='webhook',
        cascade='all, delete-orphan',
    )


class WebhookDeliveryLog(Base):
    __tablename__ = 'webhook_delivery_logs'
    __table_args__ = (
        Index('ix_wh_delivery_created', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    webhook_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('webhooks.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    webhook: Mapped['Webhook'] = relationship(
        'Webhook',
        back_populates='delivery_logs',
    )
    user: Mapped['User'] = relationship('User')
