"""book_contents — shared, content-addressed parse results (step 1: dual-write).

Design: docs/design/cross-user-content-sharing.md (r2).
Step 1 only ADDS the table and an idempotent upsert on upload; Document
keeps being written and every read path is unchanged. Later steps switch
reads (step 2), delete semantics (step 3), and chunk keys (step 4).

Revision ID: 0027
Revises: 0026
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

revision = '0027'
down_revision = '0026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'book_contents',
        sa.Column('content_hash', sa.String(64), primary_key=True),
        sa.Column('file_size', sa.BigInteger, nullable=False),
        sa.Column('file_type', sa.String(16), nullable=False),
        sa.Column('title', sa.Text, nullable=False),
        sa.Column('author', sa.Text, nullable=False),
        # Immutable parse payload (what Document stores today, per copy).
        sa.Column('chapters', JSONB, nullable=True),
        sa.Column('raw_chapters', JSONB, nullable=True),
        sa.Column('total_pages', sa.Integer, nullable=False, server_default='0'),
        sa.Column('metadata_', JSONB, name='metadata', nullable=True),
        # Shared object-storage key — per-content cover (step 3 uses this).
        sa.Column('cover_object_key', sa.Text, nullable=True),
        sa.Column('created_by', PG_UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        'ix_book_contents_size', 'book_contents', ['file_size']
    )


def downgrade() -> None:
    op.drop_index('ix_book_contents_size', table_name='book_contents')
    op.drop_table('book_contents')
