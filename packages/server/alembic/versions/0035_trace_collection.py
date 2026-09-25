"""llm_call_traces: http_status, streaming, cache_read_tokens (E3)

Revision ID: 0035
Revises: 0034
Create Date: 2026-09-25

Collection enhancement for the traces page workbench parity: HTTP status
code (from safe_invoke response handling), streaming flag (call-path
determined), and cache-read token count (provider usage details —
OpenAI-compatible prompt_tokens_details.cached_tokens / Anthropic
cache_read_input_tokens). All nullable — legacy rows simply carry NULL.
"""

import sqlalchemy as sa
from alembic import op

revision = '0035'
down_revision = '0034'


def upgrade() -> None:
    op.add_column('llm_call_traces', sa.Column('http_status', sa.Integer(), nullable=True))
    op.add_column('llm_call_traces', sa.Column('streaming', sa.Boolean(), nullable=True, server_default=sa.text('false')))
    op.add_column('llm_call_traces', sa.Column('cache_read_tokens', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('llm_call_traces', 'cache_read_tokens')
    op.drop_column('llm_call_traces', 'streaming')
    op.drop_column('llm_call_traces', 'http_status')
