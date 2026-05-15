"""Add version column to memory_books

Revision ID: 0005
Revises: 0004b
"""

from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'memory_books',
        sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('memory_books', 'version')
