"""Add composite indexes for hot-path queries.

Revision ID: 0011
Revises: 0010
"""
from alembic import op

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_annotations_user_id_type',
        'annotations',
        ['user_id', 'type'],
    )
    op.create_index(
        'ix_annotations_user_id_type_created_at',
        'annotations',
        ['user_id', 'type', 'created_at'],
    )
    op.create_index(
        'ix_flashcards_user_id_book_id',
        'flashcards',
        ['user_id', 'book_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_flashcards_user_id_book_id', table_name='flashcards')
    op.drop_index('ix_annotations_user_id_type_created_at', table_name='annotations')
    op.drop_index('ix_annotations_user_id_type', table_name='annotations')
