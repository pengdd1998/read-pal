"""set server defaults on notifications.created_at/updated_at + backfill

Revision ID: 0024
Revises: 0023
Create Date: 2026-06-16 06:00:00.000000

Same schema drift as chat_messages (0023): the Notification model declares
created_at/updated_at with ``server_default=func.now()``, but the migration
that created the ``notifications`` table didn't carry those defaults into the
columns — so both are nullable with no default, and inserts (which omit the
timestamps expecting the server default) store NULL.

Now that notifications are actually created (book-completion trigger, etc.),
NULL created_at breaks ``list_notifications`` ORDER BY and the unread
grouping. Set ``DEFAULT now()`` and backfill existing NULLs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0024'
down_revision: Union[str, None] = '0023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE notifications SET created_at = now() WHERE created_at IS NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE notifications SET updated_at = created_at WHERE updated_at IS NULL"
        )
    )
    op.alter_column(
        'notifications', 'created_at', server_default=sa.text('now()'),
    )
    op.alter_column(
        'notifications', 'updated_at', server_default=sa.text('now()'),
    )


def downgrade() -> None:
    op.alter_column('notifications', 'updated_at', server_default=None)
    op.alter_column('notifications', 'created_at', server_default=None)
