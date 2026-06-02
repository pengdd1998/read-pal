"""Add provider column to llm_call_traces.

Revision ID: 0010
Revises: 0009
"""

from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'llm_call_traces',
        sa.Column('provider', sa.String(32), nullable=True),
    )
    op.create_index(
        'ix_llm_traces_provider_created',
        'llm_call_traces',
        ['provider', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_llm_traces_provider_created')
    op.drop_column('llm_call_traces', 'provider')
