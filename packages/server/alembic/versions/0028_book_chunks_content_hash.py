"""book_chunks.content_hash — shared embeddings across users (step 4).

Revision ID: 0028
Revises: 0027
"""
from alembic import op
import sqlalchemy as sa

revision = '0028'
down_revision = '0027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('book_chunks', sa.Column('content_hash', sa.String(64), nullable=True))
    op.create_index('ix_book_chunks_content_hash', 'book_chunks', ['content_hash'])
    # Backfill: chunks of books that carry a hash (step-1 uploads/seeds)
    # adopt it; chunks of hashless legacy books stay NULL and keep working
    # through the book_id path.
    op.execute("""
        UPDATE book_chunks
        SET content_hash = (SELECT b.content_hash FROM books b WHERE b.id = book_chunks.book_id)
        WHERE content_hash IS NULL
          AND book_id IN (SELECT id FROM books WHERE content_hash IS NOT NULL)
    """)


def downgrade() -> None:
    op.drop_index('ix_book_chunks_content_hash', table_name='book_chunks')
    op.drop_column('book_chunks', 'content_hash')
