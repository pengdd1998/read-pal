"""add_unique_active_session_per_user_book

Revision ID: 0012
Revises: 39723407f440
Create Date: 2026-06-07 14:11:23.781379

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, None] = '39723407f440'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Close any orphaned active sessions before adding the unique constraint
    op.execute(
        "UPDATE reading_sessions SET is_active = false, ended_at = NOW() "
        "WHERE is_active = true AND ended_at IS NOT NULL"
    )
    op.execute(
        "UPDATE reading_sessions SET is_active = false, ended_at = NOW() "
        "WHERE id NOT IN ("
        "  SELECT DISTINCT ON (user_id, book_id) id"
        "  FROM reading_sessions WHERE is_active = true"
        "  ORDER BY user_id, book_id, started_at DESC"
        ")"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_one_active_session_per_user_book "
        "ON reading_sessions (user_id, book_id) WHERE is_active = true"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS uq_one_active_session_per_user_book"
    )
