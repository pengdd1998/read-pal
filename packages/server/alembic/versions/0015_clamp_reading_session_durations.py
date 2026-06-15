"""clamp reading-session durations and reconstruct ended_at

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-15 09:00:00.000000

Enforces two invariants on ``reading_sessions`` that the application code
already assumes, but which legacy rows violate:

1. ``duration`` must not exceed ``MAX_SESSION_SECONDS`` (7200s, 2h). A handful
   of sessions created before the end_session/heartbeat clamp landed have
   durations up to ~10.8h (idle tabs that never got capped). These dominate
   reading-time and reading-speed aggregates, making stats like "42h read for
   98 pages" look broken. Clamp them to the documented ceiling.

2. ``ended_at`` must not precede ``started_at``. ~90% of historical sessions
   have ``ended_at`` ~8h before ``started_at`` because ``utcnow()`` returns a
   timezone-naive value that Postgres misinterprets when storing into the
   ``timezone=True`` column. The ``duration`` field for these rows is correct,
   so we reconstruct ``ended_at = started_at + duration`` to make the
   timestamps internally consistent. Idempotent: rows that already satisfy
   ``ended_at >= started_at`` are untouched.

Both updates are idempotent and only touch rows that violate the invariant.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Matches app.services._session_helpers.MAX_SESSION_SECONDS
MAX_SESSION_SECONDS = 7200


def upgrade() -> None:
    # 1. Clamp durations that exceed the documented per-session ceiling.
    op.execute(
        sa.text(
            'UPDATE reading_sessions '
            'SET duration = :cap '
            'WHERE duration > :cap'
        ).bindparams(cap=MAX_SESSION_SECONDS)
    )
    # 2. Reconstruct ended_at where it precedes started_at (timezone drift).
    #    duration is authoritative; make ended_at consistent with it.
    op.execute(
        sa.text(
            'UPDATE reading_sessions '
            "SET ended_at = started_at + (COALESCE(duration, 0) * interval '1 second') "
            'WHERE ended_at IS NOT NULL AND ended_at < started_at'
        )
    )


def downgrade() -> None:
    # Data migration — original (corrupt) values are not recoverable.
    pass
