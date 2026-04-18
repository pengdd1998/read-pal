"""Book club models."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.user import User


class BookClub(Base):
    __tablename__ = 'book_clubs'
    __table_args__ = (
        Index('ix_book_clubs_invite_code', 'invite_code', unique=True),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cover_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    current_book_id: Mapped[Optional[UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    invite_code: Mapped[str] = mapped_column(
        String(6),
        unique=True,
        nullable=False,
        server_default=text("upper(substring(md5(random()::text), 1, 6))"),
    )
    max_members: Mapped[int] = mapped_column(Integer, default=20)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
    )

    creator: Mapped['User'] = relationship(
        'User',
        back_populates='created_clubs',
        foreign_keys=[created_by],
    )
    current_book: Mapped[Optional['Book']] = relationship('Book')
    members: Mapped[list['BookClubMember']] = relationship(
        'BookClubMember',
        back_populates='club',
        cascade='all, delete-orphan',
    )
    discussions: Mapped[list['ClubDiscussion']] = relationship(
        'ClubDiscussion',
        back_populates='club',
        cascade='all, delete-orphan',
    )


class BookClubMember(Base):
    __tablename__ = 'book_club_members'
    __table_args__ = (
        UniqueConstraint('club_id', 'user_id', name='uq_club_member'),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    club_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('book_clubs.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), default='member')
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())

    club: Mapped['BookClub'] = relationship('BookClub', back_populates='members')
    user: Mapped['User'] = relationship('User', back_populates='club_memberships')


class ClubDiscussion(Base):
    __tablename__ = 'club_discussions'
    __table_args__ = (
        Index('ix_club_discussions_club_created', 'club_id', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text('gen_random_uuid()'),
    )
    club_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('book_clubs.id', ondelete='CASCADE'),
        nullable=False,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    club: Mapped['BookClub'] = relationship('BookClub', back_populates='discussions')
    user: Mapped['User'] = relationship('User')
