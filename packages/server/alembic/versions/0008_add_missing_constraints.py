"""Add missing constraints, back_populates, and drop redundant indexes.

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1.  ApiKey.user_id FK: add ON DELETE CASCADE
    # ------------------------------------------------------------------
    # The auto-generated constraint name follows the pattern
    # <table>_<column>_fkey in PostgreSQL.
    op.drop_constraint('api_keys_user_id_fkey', 'api_keys', type_='foreignkey')
    op.create_foreign_key(
        'api_keys_user_id_fkey',
        'api_keys',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 2.  CHECK constraints
    # ------------------------------------------------------------------
    op.create_check_constraint(
        'ck_chat_messages_role',
        'chat_messages',
        sa.column('role').in_(['user', 'assistant', 'system']),
    )
    op.create_check_constraint(
        'ck_notifications_type',
        'notifications',
        sa.column('type').in_([
            'streak_milestone',
            'streak_at_risk',
            'reading_reminder',
            'goal_achieved',
            'system',
        ]),
    )
    op.create_check_constraint(
        'ck_friend_conversations_persona',
        'friend_conversations',
        sa.column('persona').in_(['sage', 'penny', 'alex', 'quinn', 'sam']),
    )

    # ------------------------------------------------------------------
    # 3.  Drop redundant 2-column indexes (covered by 3-column variants)
    # ------------------------------------------------------------------
    op.drop_index('ix_chat_messages_user_id_book_id', table_name='chat_messages')
    op.drop_index('ix_annotations_user_id_book_id', table_name='annotations')


def downgrade() -> None:
    # ------------------------------------------------------------------
    # 3.  Restore redundant indexes
    # ------------------------------------------------------------------
    op.create_index(
        'ix_annotations_user_id_book_id',
        'annotations',
        ['user_id', 'book_id'],
    )
    op.create_index(
        'ix_chat_messages_user_id_book_id',
        'chat_messages',
        ['user_id', 'book_id'],
    )

    # ------------------------------------------------------------------
    # 2.  Drop CHECK constraints
    # ------------------------------------------------------------------
    op.drop_constraint('ck_friend_conversations_persona', 'friend_conversations', type_='check')
    op.drop_constraint('ck_notifications_type', 'notifications', type_='check')
    op.drop_constraint('ck_chat_messages_role', 'chat_messages', type_='check')

    # ------------------------------------------------------------------
    # 1.  Revert ApiKey FK (remove ON DELETE CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('api_keys_user_id_fkey', 'api_keys', type_='foreignkey')
    op.create_foreign_key(
        'api_keys_user_id_fkey',
        'api_keys',
        'users',
        ['user_id'],
        ['id'],
    )
