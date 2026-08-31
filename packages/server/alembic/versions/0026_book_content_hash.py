"""Book content hash for per-user upload dedup.

Revision ID: 0026
Revises: 0025
Create Date: 2026-08-31

Dedup semantics: the same EPUB re-uploaded by the same user returns the
existing book (no re-parse, no duplicate rows, no re-embedding). The index
is a plain composite (not unique) — legacy duplicates exist, and new books
created before this migration simply have NULL hashes (never matched).
"""
from alembic import op
import sqlalchemy as sa

revision = '0026'
down_revision = '0025'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('books', sa.Column('content_hash', sa.String(64), nullable=True))
    op.create_index(
        'ix_books_user_content_hash',
        'books',
        ['user_id', 'content_hash'],
        postgresql_where=sa.text('content_hash IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_books_user_content_hash', table_name='books')
    op.drop_column('books', 'content_hash')
