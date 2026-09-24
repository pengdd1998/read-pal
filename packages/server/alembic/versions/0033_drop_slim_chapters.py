"""Drop book_contents.chapters slim column (disk optimization)

Revision ID: 0033
Revises: 0032
Create Date: 2026-09-24

The slim (no-rawContent) chapters copy was ~45% of each book_contents row
and had no reader — the only code path touching it was a fallback for
rows whose raw_chapters is NULL, and the two columns were always written
together (raw never missing in practice; the deploy-time precondition
verified all live rows carry raw_chapters). Writers stopped in the same
PR as this migration.

Downgrade is lossless: the slim copy is derivable from raw_chapters.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision = '0033'
down_revision = '0032'


def upgrade() -> None:
    op.drop_column('book_contents', 'chapters')


def downgrade() -> None:
    op.add_column('book_contents', sa.Column('chapters', sa.JSONB(), nullable=True))
    # Rebuild the slim projection (raw minus the rawContent key).
    op.get_bind().execute(text("""
        UPDATE book_contents
        SET chapters = (
            SELECT jsonb_agg(ch - 'rawContent')
            FROM jsonb_array_elements(raw_chapters) AS ch
        )
        WHERE raw_chapters IS NOT NULL
    """))
