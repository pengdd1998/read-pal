"""ApiKey model — mirrors the Node.js Sequelize ApiKey model exactly."""

import hashlib
import os
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

API_KEY_PREFIX = 'rpk_'


def generate_api_key() -> tuple[str, str, str]:
    """Generate a new API key tuple: (plain_key, key_hash, key_prefix)."""
    raw = os.urandom(32).hex()
    plain_key = f'{API_KEY_PREFIX}{raw}'
    key_hash = hashlib.sha256(plain_key.encode()).hexdigest()
    key_prefix = plain_key[:10]  # "rpk_" + first 6 chars
    return plain_key, key_hash, key_prefix


def hash_api_key(plain_key: str) -> str:
    """SHA-256 hash an API key for lookup."""
    return hashlib.sha256(plain_key.encode()).hexdigest()


def is_api_key_format(token: str) -> bool:
    """Check if a token string looks like an API key."""
    return token.startswith(API_KEY_PREFIX)


class ApiKey(Base):
    """Personal access token for programmatic API access."""

    __tablename__ = 'api_keys'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        'user_id',
        UUID(as_uuid=True),
        ForeignKey('users.id'),
        nullable=False,
        index=True,
    )

    user: Mapped['User'] = relationship('User', back_populates='api_keys')
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_hash: Mapped[str] = mapped_column(
        'key_hash',
        String(64),
        unique=True,
        nullable=False,
    )
    key_prefix: Mapped[str] = mapped_column(
        'key_prefix',
        String(10),
        nullable=False,
        index=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        'last_used_at',
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        'created_at',
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        'updated_at',
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
