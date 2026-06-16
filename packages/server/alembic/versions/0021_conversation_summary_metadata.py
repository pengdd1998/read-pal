"""add metadata JSONB to conversation_summaries

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-16 00:00:00.000000

Adds ``metadata`` JSONB column to ``conversation_summaries`` for provenance
tracking (P3.1: memory schema upgrade). Stores which prompt version and
model generated each summary, so:

1. Stale summaries (prompt_version mismatch on next read) can be detected
   and regenerated instead of reused.
2. Quality regressions can be attributed to specific prompts/models during
   triage.
3. Future fields (schema_version, confidence, source tags) can land
   without another migration — JSONB is open-shaped.

Nullable: rows written before this migration have NULL metadata; the
service treats NULL as "stale" to force a regenerate-on-next-write path
rather than trusting un-attributed summaries.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '0021'
down_revision: Union[str, None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'conversation_summaries',
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('conversation_summaries', 'metadata')
