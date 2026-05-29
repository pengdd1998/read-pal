"""Add composite indexes for reading_sessions and book_chunks.

Revision ID: 0008
Revises: 0007
"""

from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_reading_sessions_user_book_started',
        'reading_sessions',
        ['user_id', 'book_id', 'started_at'],
    )
    op.create_index(
        'ix_book_chunks_book_chapter',
        'book_chunks',
        ['book_id', 'chapter_index'],
    )


def downgrade() -> None:
    op.drop_index('ix_book_chunks_book_chapter', table_name='book_chunks')
    op.drop_index('ix_reading_sessions_user_book_started', table_name='reading_sessions')
