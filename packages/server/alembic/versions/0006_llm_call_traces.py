"""Add llm_call_traces table for persistent LLM observability.

Revision ID: 0006
Revises: 0005
"""

from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'llm_call_traces',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('request_id', sa.String(12), nullable=False),
        sa.Column('model', sa.String(50), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), server_default='0'),
        sa.Column('total_tokens', sa.Integer(), server_default='0'),
        sa.Column('estimated_cost_usd', sa.Float(), server_default='0'),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('fallback_used', sa.Boolean(), server_default='false'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_llm_traces_created', 'llm_call_traces', ['created_at'])
    op.create_index('ix_llm_traces_model_created', 'llm_call_traces', ['model', 'created_at'])
    op.create_index('ix_llm_traces_label_created', 'llm_call_traces', ['label', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_llm_traces_label_created', table_name='llm_call_traces')
    op.drop_index('ix_llm_traces_model_created', table_name='llm_call_traces')
    op.drop_index('ix_llm_traces_created', table_name='llm_call_traces')
    op.drop_table('llm_call_traces')
