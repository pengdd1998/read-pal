"""Replace collections.book_ids ARRAY with collection_books join table.

Revision ID: 0007
Revises: 0006
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the join table
    op.create_table(
        'collection_books',
        sa.Column('collection_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('collection_id', 'book_id'),
        sa.ForeignKeyConstraint(['collection_id'], ['collections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_collection_books_book_id', 'collection_books', ['book_id'])

    # 2. Migrate existing data from book_ids array into collection_books rows
    op.execute("""
        INSERT INTO collection_books (collection_id, book_id, added_at)
        SELECT c.id, unnest(c.book_ids), now()
        FROM collections c
        WHERE c.book_ids IS NOT NULL AND array_length(c.book_ids, 1) IS NOT NULL
    """)

    # 3. Drop the GIN index and the book_ids column
    op.drop_index('ix_collections_book_ids_gin', table_name='collections')
    op.drop_column('collections', 'book_ids')


def downgrade() -> None:
    # 1. Re-add the book_ids ARRAY column
    op.add_column(
        'collections',
        sa.Column('book_ids', postgresql.ARRAY(sa.UUID()), nullable=True),
    )

    # 2. Restore data from join table back into the array
    op.execute("""
        UPDATE collections c
        SET book_ids = sub.aggregated_ids
        FROM (
            SELECT cb.collection_id, array_agg(cb.book_id) AS aggregated_ids
            FROM collection_books cb
            GROUP BY cb.collection_id
        ) sub
        WHERE c.id = sub.collection_id
    """)

    # 3. Recreate the GIN index
    op.create_index(
        'ix_collections_book_ids_gin', 'collections', ['book_ids'],
        postgresql_using='gin',
    )

    # 4. Drop the join table
    op.drop_index('ix_collection_books_book_id', table_name='collection_books')
    op.drop_table('collection_books')
