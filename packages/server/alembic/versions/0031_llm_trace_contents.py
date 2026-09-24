"""llm_trace_contents table (monitoring-upgrade P-D)

Revision ID: 0031
Revises: 0030
Create Date: 2026-09-24

Opt-in raw prompt/output capture for badcase replay. Default-off feature
(LLM_TRACE_CONTENT_DB): the table can sit empty forever on deployments
that never opt in; retention is short (llm_trace_content_retention_days,
7d default) and the read path is ops-key-only. Downgrade drops it —
captured content is telemetry, not user data of record.
"""

from alembic import op
import sqlalchemy as sa

revision = '0031'
down_revision = '0030'


def upgrade() -> None:
    op.create_table(
        'llm_trace_contents',
        sa.Column('request_id', sa.String(length=12), nullable=False),
        sa.Column('http_request_id', sa.String(length=50), nullable=True),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('model', sa.String(length=50), nullable=False),
        sa.Column('prompt_version', sa.String(length=32), nullable=True),
        sa.Column('prompt_text', sa.Text(), nullable=True),
        sa.Column('output_text', sa.Text(), nullable=True),
        sa.Column(
            'prompt_truncated', sa.Boolean(), nullable=False, server_default='false',
        ),
        sa.Column(
            'output_truncated', sa.Boolean(), nullable=False, server_default='false',
        ),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('book_id', sa.String(length=36), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
        ),
        sa.PrimaryKeyConstraint('request_id'),
    )
    op.create_index(
        'ix_llm_trace_contents_created', 'llm_trace_contents', ['created_at'],
    )
    op.create_index(
        'ix_llm_trace_contents_http_request_id', 'llm_trace_contents', ['http_request_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_llm_trace_contents_http_request_id', table_name='llm_trace_contents')
    op.drop_index('ix_llm_trace_contents_created', table_name='llm_trace_contents')
    op.drop_table('llm_trace_contents')
