"""BookChunk model — pre-computed text chunks with embedding vectors."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

if TYPE_CHECKING:
    from app.models.book import Book
    from app.models.document import Document

try:
    from pgvector.sqlalchemy import Vector

    VECTOR_TYPE = Vector
except ImportError:
    VECTOR_TYPE = None


class BookChunk(Base):
    __tablename__ = 'book_chunks'
    __table_args__ = (
        Index('ix_book_chunks_book_id', 'book_id'),
        Index('ix_book_chunks_book_chapter', 'book_id', 'chapter_index'),
        Index(
            'ix_book_chunks_embedding_cosine',
            'embedding',
            postgresql_using='hnsw',
            postgresql_with={'m': 16, 'ef_construction': 64},
            postgresql_ops={'embedding': 'vector_cosine_ops'},
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text('gen_random_uuid()'),
    )
    book_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('books.id', ondelete='CASCADE'),
        nullable=False,
    )
    document_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey('documents.id', ondelete='CASCADE'),
        nullable=False,
    )
    chapter_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list | None] = mapped_column(
        VECTOR_TYPE(1024) if VECTOR_TYPE else Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    book: Mapped['Book'] = relationship('Book', back_populates='chunks')
    document: Mapped['Document'] = relationship('Document')
