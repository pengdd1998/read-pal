"""Add book_chunks table with pgvector extension for embedding storage.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    op.create_table(
        'book_chunks',
        sa.Column(
            'id', PG_UUID(as_uuid=True),
            server_default=sa.text('gen_random_uuid()'), primary_key=True,
        ),
        sa.Column(
            'book_id', PG_UUID(as_uuid=True),
            sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'document_id', PG_UUID(as_uuid=True),
            sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('chapter_index', sa.Integer, nullable=False),
        sa.Column('chunk_index', sa.Integer, nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('embedding', sa.Text, nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.execute(
        'ALTER TABLE book_chunks '
        'ALTER COLUMN embedding TYPE vector(1024) USING embedding::vector(1024)'
    )

    op.execute(
        "CREATE INDEX ix_book_chunks_embedding_cosine "
        "ON book_chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_book_chunks_embedding_cosine')
    op.drop_table('book_chunks')
    op.execute('DROP EXTENSION IF EXISTS vector CASCADE')
