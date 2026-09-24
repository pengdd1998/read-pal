"""book_chunks book_id/document_id nullable (content-addressed chunks)

Revision ID: 0032
Revises: 0031
Create Date: 2026-09-24

Hash-shared chunks were anchored to the FIRST uploader's book/document
rows — both FKs ON DELETE CASCADE, so deleting that user's book (e.g.
test-account cleanup) silently destroyed the shared chunks every other
copy of the book searches through (2026-09-24: one hash fell 1296→70
chunks, nine hashes to zero). Content-addressed chunks mirror
book_contents: anchored by content_hash alone, book_id/document_id
nullable and only set for legacy per-book rows.

Downgrade restores NOT NULL — only valid when no NULL rows remain.
"""

from alembic import op

revision = '0032'
down_revision = '0031'


def upgrade() -> None:
    op.alter_column('book_chunks', 'book_id', nullable=True)
    op.alter_column('book_chunks', 'document_id', nullable=True)


def downgrade() -> None:
    # Refuse-by-noise: restoring NOT NULL fails loudly if shared rows
    # (NULL ids) still exist — the operator must re-anchor or delete them.
    op.alter_column('book_chunks', 'document_id', nullable=False)
    op.alter_column('book_chunks', 'book_id', nullable=False)
