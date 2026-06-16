"""add cache_hit + error_type to llm_call_traces

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-16 02:00:00.000000

P4.2: observability gaps. Adds two columns that close long-standing holes
in the LLM trace surface:

- ``cache_hit BOOLEAN DEFAULT FALSE`` — when ``safe_llm_invoke`` /
  ``safe_llm_call`` short-circuits on a Redis cache hit, NO trace was
  emitted at all. That made cache hit rate uncomputable from traces, and
  hid the fact that a "fast" request was served from cache vs. an
  unusually-cheap LLM call. Cached responses now emit a trace row with
  ``cache_hit = TRUE`` so they're visible in the same surface.

- ``error_type VARCHAR(32) NULL`` — ``error_message`` is free-form text,
  so "how many 429s vs 5xx in the last hour?" required regex over
  strings. ``error_type`` is a categorical field with stable values
  (``rate_limit`` / ``network`` / ``timeout`` / ``auth`` / ``server_error``
  / ``cancelled`` / ``unknown``) that SQL/ELK dashboards can group on.

Both nullable/defaulted so existing rows and existing call sites keep
working without code changes — the new fields are populated going forward.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0022'
down_revision: Union[str, None] = '0021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'llm_call_traces',
        sa.Column('cache_hit', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.add_column(
        'llm_call_traces',
        sa.Column('error_type', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('llm_call_traces', 'error_type')
    op.drop_column('llm_call_traces', 'cache_hit')
