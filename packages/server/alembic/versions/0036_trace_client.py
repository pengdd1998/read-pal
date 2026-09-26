"""llm_call_traces: client column (H4 — web/mobile/ops attribution)

Revision ID: 0036
Revises: 0035
Create Date: 2026-09-26

Client surface for the overview client-analysis card (CCR "client
analysis" counterpart): request_log middleware classifies each HTTP
request from its headers (X-Ops-Key present → ops; Capacitor/mobile UA →
mobile; otherwise web) and binds it into the structlog contextvars, the
same channel http_request_id rides. Nullable — non-HTTP contexts (eval,
background) and legacy rows carry NULL.
"""

import sqlalchemy as sa
from alembic import op

revision = '0036'
down_revision = '0035'


def upgrade() -> None:
    op.add_column('llm_call_traces', sa.Column('client', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('llm_call_traces', 'client')
