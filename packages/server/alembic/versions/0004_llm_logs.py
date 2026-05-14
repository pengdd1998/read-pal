"""Add llm_logs table for LLM call observability.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'llm_logs',
        sa.Column('id', PG_UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('user_id', PG_UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('book_id', PG_UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('request_id', sa.String(32), nullable=False, index=True),
        sa.Column('model', sa.String(64), nullable=False),
        sa.Column('label', sa.String(128), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('completion_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('estimated_cost', sa.Numeric(12, 8), nullable=True),
        sa.Column('latency_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('success', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('is_fallback', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('extra', JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
        sa.Index('ix_llm_logs_user_created', 'user_id', 'created_at'),
        sa.Index('ix_llm_logs_book_created', 'book_id', 'created_at'),
        sa.Index('ix_llm_logs_label_created', 'label', 'created_at'),
    )


def downgrade() -> None:
    op.drop_table('llm_logs')
