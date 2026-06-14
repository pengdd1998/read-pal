"""chat_message soft delete and ai_feedback message fk

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-14 12:00:00.000000

Adds:
1. ``chat_messages.deleted_at`` (nullable timestamp) for soft-delete in the
   regenerate flow (P1-6).
2. Converts ``ai_feedback.message_id`` from TEXT to PG_UUID and adds a real
   FK to ``chat_messages.id`` with ``ondelete='CASCADE'`` (P0-4). Orphan
   rows (message_id that doesn't match a chat message) are dropped first
   so the FK constraint can be added without an ALTER fail.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. chat_messages.deleted_at + supporting index --------------------
    op.add_column(
        'chat_messages',
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        'ix_chat_messages_user_book_active_created',
        'chat_messages',
        ['user_id', 'book_id', 'created_at'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )

    # --- 2. ai_feedback.message_id: TEXT → UUID FK -------------------------
    # Drop orphan rows first (message_id that doesn't resolve to a chat row).
    # NULL message_id is preserved (legit "general" feedback).
    op.execute(
        "DELETE FROM ai_feedback "
        "WHERE message_id IS NOT NULL "
        "AND message_id NOT IN (SELECT id::text FROM chat_messages)"
    )
    # Some legacy rows may have message_id that fails UUID parsing — drop them
    # rather than failing the migration. Use a regex guard via NULLIF on cast.
    op.execute(
        "DELETE FROM ai_feedback "
        "WHERE message_id IS NOT NULL "
        "AND message_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"
    )

    # Drop any existing index on message_id before type change (best-effort).
    op.execute("DROP INDEX IF EXISTS ix_ai_feedback_message_id")

    # Alter column type from TEXT to UUID. The USING clause converts existing
    # text values to UUID; NULLs stay NULL.
    op.alter_column(
        'ai_feedback',
        'message_id',
        type_=PG_UUID(as_uuid=True),
        postgresql_using='message_id::uuid',
        existing_type=sa.Text(),
        existing_nullable=True,
    )

    op.create_foreign_key(
        'fk_ai_feedback_message_id_chat_messages',
        'ai_feedback',
        'chat_messages',
        ['message_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_ai_feedback_message_id',
        'ai_feedback',
        ['message_id'],
    )


def downgrade() -> None:
    # Drop FK + index, revert type to TEXT, drop deleted_at column.
    op.drop_constraint(
        'fk_ai_feedback_message_id_chat_messages',
        'ai_feedback',
        type_='foreignkey',
    )
    op.drop_index('ix_ai_feedback_message_id', table_name='ai_feedback')

    op.alter_column(
        'ai_feedback',
        'message_id',
        type_=sa.Text(),
        postgresql_using='message_id::text',
        existing_type=PG_UUID(as_uuid=True),
        existing_nullable=True,
    )

    op.drop_index('ix_chat_messages_user_book_active_created', table_name='chat_messages')
    op.drop_column('chat_messages', 'deleted_at')
