"""drop api_keys table

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-14 14:30:00.000000

Removes the ``api_keys`` table and its indexes. The Developer API feature
(personal access tokens for programmatic API access) was never part of the
project goals, so the entire feature — router, model, schema, service,
frontend pages, and this table — has been removed. Authentication now uses
JWT only.

The downgrade recreates the table for anyone who needs to roll back.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ix_api_keys_key_prefix', table_name='api_keys')
    op.drop_index('ix_api_keys_user_id', table_name='api_keys')
    op.drop_constraint('uq_api_keys_key_hash', 'api_keys', type_='unique')
    op.drop_table('api_keys')


def downgrade() -> None:
    op.create_table(
        'api_keys',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('key_hash', sa.String(64), nullable=False),
        sa.Column('key_prefix', sa.String(10), nullable=False),
        sa.Column('last_used_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )
    op.create_index('ix_api_keys_user_id', 'api_keys', ['user_id'])
    op.create_unique_constraint('uq_api_keys_key_hash', 'api_keys', ['key_hash'])
    op.create_index('ix_api_keys_key_prefix', 'api_keys', ['key_prefix'])
