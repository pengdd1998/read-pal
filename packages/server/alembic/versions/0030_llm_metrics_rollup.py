"""llm_metrics_rollup table (monitoring-upgrade P-C)

Revision ID: 0030
Revises: 0029
Create Date: 2026-09-20

Hour × label × provider pre-aggregation of llm_call_traces: long metrics
windows (>48h) and the alerting thresholds read this instead of scanning
the raw trace table. Downgrade drops it — it is derived data, fully
rebuildable from traces within the retention horizon.
"""

from alembic import op
import sqlalchemy as sa

revision = '0030'
down_revision = '0029'


def upgrade() -> None:
    op.create_table(
        'llm_metrics_rollup',
        sa.Column('hour', sa.DateTime(), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False, server_default='(unset)'),
        sa.Column('calls', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('successes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fresh_calls', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fallbacks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tokens_in', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('tokens_out', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('cost_usd', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('latency_cnt', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('latency_sum_ms', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('latency_max_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('latency_p95_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_counts', sa.String(length=512), nullable=False, server_default=''),
        sa.PrimaryKeyConstraint('hour', 'label', 'provider'),
    )
    op.create_index(
        'ix_llm_metrics_rollup_hour', 'llm_metrics_rollup', ['hour'],
    )


def downgrade() -> None:
    op.drop_index('ix_llm_metrics_rollup_hour', table_name='llm_metrics_rollup')
    op.drop_table('llm_metrics_rollup')
