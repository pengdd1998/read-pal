"""mark books at 100% progress as completed

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-15 09:45:00.000000

Enforces the application invariant: a book whose ``progress >= 100`` (i.e.
``current_page >= total_pages``) is completed. The completion-marking logic
(``update_book_completion``) was added in 16ec2e31; a handful of books that
reached 100% before that (or via a path that didn't check completion) are
stuck at ``status='reading'`` with ``progress=100``. This skews the
"Completed" count on the stats page (e.g. a user who finished a book sees
"0 Completed").

Also closes the scroll-only gap: reaching the end of the final chapter via
scroll (no ``current_page`` change) now triggers completion too.

Idempotent: only touches rows at progress >= 100 that aren't already
completed. ``completed_at`` falls back to ``last_read_at`` then ``now()``.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE books "
            "SET status = 'completed', "
            "    completed_at = COALESCE(completed_at, last_read_at, now()), "
            "    progress = 100 "
            "WHERE progress >= 100 AND status <> 'completed'"
        )
    )


def downgrade() -> None:
    # Data migration — original status not recoverable.
    pass
