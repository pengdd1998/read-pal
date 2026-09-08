"""add user_id/book_id to llm_call_traces for badcase triage

Engineering-upgrade follow-up (2026-09-05): user_id/book_id were previously
emitted only into stdout structured logs — badcase triage could not query
"all LLM calls for this user/book" from the trace table. Nullable columns,
plus a (user_id, created_at) index for the triage lookup pattern.

This migration also closes a model-vs-migration drift: 0018 added
``http_request_id`` to the database but the model class never declared it
(the column existed but was never written). The model now declares it and
``observability._log_call`` fills it from the request_log middleware's
structlog contextvar.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision = '0029'
down_revision = '0028'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('llm_call_traces', sa.Column('user_id', sa.String(36), nullable=True))
    op.add_column('llm_call_traces', sa.Column('book_id', sa.String(36), nullable=True))
    op.create_index('ix_llm_traces_user_created', 'llm_call_traces', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_llm_traces_user_created', table_name='llm_call_traces')
    op.drop_column('llm_call_traces', 'book_id')
    op.drop_column('llm_call_traces', 'user_id')
