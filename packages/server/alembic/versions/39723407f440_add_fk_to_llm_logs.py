"""add_fk_to_llm_logs

Revision ID: 39723407f440
Revises: 0011
Create Date: 2026-06-07 13:46:01.367032

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '39723407f440'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Delete orphan llm_logs rows before adding FK constraints
    op.execute(
        "DELETE FROM llm_logs WHERE user_id NOT IN (SELECT id FROM users)"
    )
    op.execute(
        "DELETE FROM llm_logs WHERE book_id IS NOT NULL AND book_id NOT IN (SELECT id FROM books)"
    )

    op.create_foreign_key(
        'fk_llm_logs_user_id',
        'llm_logs', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_llm_logs_book_id',
        'llm_logs', 'books',
        ['book_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_llm_logs_book_id', 'llm_logs', type_='foreignkey')
    op.drop_constraint('fk_llm_logs_user_id', 'llm_logs', type_='foreignkey')
