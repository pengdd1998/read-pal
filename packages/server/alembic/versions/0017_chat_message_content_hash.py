"""add content_hash column to chat_messages for deduplication

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-15 13:00:00.000000

Adds ``content_hash VARCHAR(32)`` column to ``chat_messages`` for
message deduplication. The hash is computed as ``md5(content[:500])`` and
is used to prevent storing duplicate messages when the LLM cache is hit.

The column is nullable to allow backfill. Existing messages will have
``content_hash=NULL``; new messages will compute the hash on insert.

Index: ``ix_chat_messages_user_book_role_hash_created`` on
(user_id, book_id, role, content_hash, created_at) for efficient
dedup queries checking "same user, book, role, hash within 60s".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add content_hash column
    op.add_column(
        'chat_messages',
        sa.Column('content_hash', sa.String(32), nullable=True),
    )

    # Add index for dedup queries
    op.create_index(
        'ix_chat_messages_user_book_role_hash_created',
        'chat_messages',
        ['user_id', 'book_id', 'role', 'content_hash', 'created_at'],
    )

    # Backfill content_hash for existing messages
    op.execute(
        sa.text(
            "UPDATE chat_messages "
            "SET content_hash = md5(substring(content, 1, 500)) "
            "WHERE content_hash IS NULL"
        )
    )

    # Make column non-nullable after backfill
    op.alter_column(
        'chat_messages',
        'content_hash',
        nullable=False,
    )


def downgrade() -> None:
    op.drop_index('ix_chat_messages_user_book_role_hash_created')
    op.drop_column('chat_messages', 'content_hash')
