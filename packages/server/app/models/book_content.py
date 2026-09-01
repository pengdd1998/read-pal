"""BookContent — shared, content-addressed parse results.

Design: docs/design/cross-user-content-sharing.md (r2). The immutable
payload of a parsed upload (chapters, metadata, cover key), stored once
per distinct file bytes (SHA-256 PK) and referenced by every user's Book
copy. Step 1 writes it in parallel with the legacy Document; reads still
come from Document until step 2.
"""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

if TYPE_CHECKING:
    pass


class BookContent(Base):
    __tablename__ = 'book_contents'

    content_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_type: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str] = mapped_column(Text, nullable=False)

    # Immutable parse payload — the chapters array the reader consumes.
    chapters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_chapters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    total_pages: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default='0',
    )
    metadata_: Mapped[dict | None] = mapped_column(
        'metadata', JSONB, nullable=True,
    )

    # Shared object-storage key for the cover (per content, not per book).
    cover_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Provenance — the first uploader; content itself is book text, not
    # user data, so this is informational only.
    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
