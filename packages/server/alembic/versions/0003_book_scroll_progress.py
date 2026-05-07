"""Add scroll_progress column to books table for fine-grained progress tracking.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'books',
        sa.Column('scroll_progress', sa.Numeric(4, 3), server_default='0', nullable=True),
    )


def downgrade() -> None:
    op.drop_column('books', 'scroll_progress')
