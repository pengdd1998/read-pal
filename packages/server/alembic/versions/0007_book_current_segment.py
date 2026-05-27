"""Add current_segment column to books table.

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'books',
        sa.Column('current_segment', sa.Integer, server_default='0', nullable=True),
    )


def downgrade() -> None:
    op.drop_column('books', 'current_segment')
