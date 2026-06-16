"""add ttft_ms to llm_call_traces

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-15 22:00:00.000000

Adds ``ttft_ms`` (time-to-first-token) to ``llm_call_traces`` for streaming
observability — lets dashboards distinguish slow-model from slow-network
from queued-request. The streaming path already computes TTFT internally;
this column lets it land in the durable trace alongside the existing
``latency_ms``.

NULL for non-streaming calls (where TTFT ≈ latency) and for streaming
errors that produced no tokens.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0020'
down_revision: Union[str, None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'llm_call_traces',
        sa.Column('ttft_ms', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('llm_call_traces', 'ttft_ms')
