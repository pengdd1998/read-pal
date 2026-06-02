"""Add composite indexes for shared_exports and llm_logs

Revision ID: 0009
Revises: 0008
"""
from alembic import op


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_shared_exports_user_book',
        'shared_exports',
        ['user_id', 'book_id'],
        if_not_exists=True,
    )
    op.create_index(
        'ix_shared_exports_expires_at',
        'shared_exports',
        ['expires_at'],
        if_not_exists=True,
    )
    op.create_index(
        'ix_llm_logs_user_label_created',
        'llm_logs',
        ['user_id', 'label', 'created_at'],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index('ix_llm_logs_user_label_created', table_name='llm_logs')
    op.drop_index('ix_shared_exports_expires_at', table_name='shared_exports')
    op.drop_index('ix_shared_exports_user_book', table_name='shared_exports')
