"""User model."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.annotation import Annotation
    from app.models.api_key import ApiKey
    from app.models.book import Book
    from app.models.book_club import BookClub, BookClubMember
    from app.models.chat_message import ChatMessage
    from app.models.collection import Collection
    from app.models.flashcard import Flashcard
    from app.models.friend import FriendConversation, FriendRelationship
    from app.models.intervention_feedback import InterventionFeedback
    from app.models.memory_book import MemoryBook
    from app.models.notification import Notification
    from app.models.reading_session import ReadingSession
    from app.models.shared_export import SharedExport
    from app.models.webhook import Webhook


class User(Base):
    __tablename__ = 'users'

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    password_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    avatar: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    google_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
    )
    settings: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    books: Mapped[list['Book']] = relationship(
        'Book',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    annotations: Mapped[list['Annotation']] = relationship(
        'Annotation',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    reading_sessions: Mapped[list['ReadingSession']] = relationship(
        'ReadingSession',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    memory_books: Mapped[list['MemoryBook']] = relationship(
        'MemoryBook',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    chat_messages: Mapped[list['ChatMessage']] = relationship(
        'ChatMessage',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    flashcards: Mapped[list['Flashcard']] = relationship(
        'Flashcard',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    collections: Mapped[list['Collection']] = relationship(
        'Collection',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    shared_exports: Mapped[list['SharedExport']] = relationship(
        'SharedExport',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    notifications: Mapped[list['Notification']] = relationship(
        'Notification',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    api_keys: Mapped[list['ApiKey']] = relationship(
        'ApiKey',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    webhooks: Mapped[list['Webhook']] = relationship(
        'Webhook',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    friend_conversations: Mapped[list['FriendConversation']] = relationship(
        'FriendConversation',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    friend_relationship: Mapped[Optional['FriendRelationship']] = relationship(
        'FriendRelationship',
        back_populates='user',
        cascade='all, delete-orphan',
        uselist=False,
    )
    intervention_feedback: Mapped[list['InterventionFeedback']] = relationship(
        'InterventionFeedback',
        back_populates='user',
        cascade='all, delete-orphan',
    )
    created_clubs: Mapped[list['BookClub']] = relationship(
        'BookClub',
        back_populates='creator',
        cascade='all, delete-orphan',
        foreign_keys='BookClub.created_by',
    )
    club_memberships: Mapped[list['BookClubMember']] = relationship(
        'BookClubMember',
        back_populates='user',
        cascade='all, delete-orphan',
    )
