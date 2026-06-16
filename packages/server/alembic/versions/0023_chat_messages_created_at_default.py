"""set server default on chat_messages.created_at + backfill NULLs

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-16 04:00:00.000000

The ChatMessage model declares ``created_at`` with ``server_default=func.now()``,
but the migration that created the ``chat_messages`` table didn't carry that
default into the column — so the column is nullable with no default, and every
INSERT (which omits created_at, expecting the server default) stored NULL.

Symptoms: chat history ``ORDER BY created_at`` is broken (NULLs sort
unpredictably), the companion's context loader sees mis-ordered history, and
the dedup index (user, book, role, content_hash, created_at) can't bound its
60s window. Companion messages also never displayed a timestamp.

Fix: set ``DEFAULT now()`` on the column and backfill existing NULLs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0023'
down_revision: Union[str, None] = '0022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE chat_messages SET created_at = now() WHERE created_at IS NULL"
        )
    )
    op.alter_column(
        'chat_messages',
        'created_at',
        server_default=sa.text('now()'),
    )


def downgrade() -> None:
    op.alter_column(
        'chat_messages',
        'created_at',
        server_default=None,
    )
