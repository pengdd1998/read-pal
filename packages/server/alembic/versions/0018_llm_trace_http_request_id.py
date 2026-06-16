"""add http_request_id column to llm_call_traces for HTTP-LLM correlation

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-15 13:30:00.000000

Adds ``http_request_id VARCHAR(50)`` column to ``llm_call_traces`` to
correlate LLM traces with HTTP request logs. The ``http_request_id`` comes
from the ``X-Request-Id`` header set by the request logging middleware and
allows bridging app logs ↔ LLM provider traces during incident triage.

The LLM layer has its own internal ``request_id`` (12-char hex); this new
field links that to the external HTTP request ID.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0018'
down_revision: Union[str, None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'llm_call_traces',
        sa.Column('http_request_id', sa.String(50), nullable=True),
    )
    op.create_index('ix_llm_traces_http_request_id', 'llm_call_traces', ['http_request_id'])


def downgrade() -> None:
    op.drop_index('ix_llm_traces_http_request_id')
    op.drop_column('llm_call_traces', 'http_request_id')
