"""backfill + default all created_at/updated_at columns

Revision ID: 0025
Revises: 0024
Create Date: 2026-06-16 08:00:00.000000

Systemic schema drift: many models declare created_at/updated_at with
``server_default=func.now()``, but the alembic migrations that created those
tables didn't carry the default into the column — so the columns are nullable
with NO default, and inserts (which omit the timestamps expecting the server
default) stored NULL.

Confirmed NULL created_at counts at audit time: annotations 100/1025,
users 50/107, documents 65/96, flashcards 18/20, collections 6/8,
intervention_feedback 13/14, book_clubs 1/4, friend_relationships 1/1.
NULL timestamps break ``ORDER BY created_at`` (annotation/chat/flashcard
history, user listings) and any "newest first" query.

Rather than hand-write a migration per table, this introspects
information_schema and (a) backfills NULLs, (b) sets ``DEFAULT now()`` on
every created_at/updated_at column that lacks one. Idempotent and additive.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Single DO block: backfill NULLs, then set DEFAULT now() on every
# created_at/updated_at column in the public schema that lacks a default.
_SQL = sa.text(
    """
DO $$
DECLARE r record;
BEGIN
  -- Backfill NULL created_at
  FOR r IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'created_at' AND table_schema = 'public'
  LOOP
    EXECUTE format('UPDATE %I SET created_at = now() WHERE created_at IS NULL', r.table_name);
  END LOOP;

  -- Backfill NULL updated_at from created_at (or now() if that is also null)
  FOR r IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'UPDATE %I SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL',
      r.table_name
    );
  END LOOP;

  -- Set DEFAULT now() on created_at / updated_at columns that lack one
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE column_name IN ('created_at', 'updated_at')
      AND table_schema = 'public'
      AND column_default IS NULL
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', r.table_name, r.column_name);
  END LOOP;
END
$$;
"""
)


def upgrade() -> None:
    op.execute(_SQL)


def downgrade() -> None:
    # Reverting column defaults table-by-table is not worth the risk; the
    # backfilled rows are correct regardless. No-op downgrade.
    pass
