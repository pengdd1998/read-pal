"""llm_trace_contents: UUID PK + (request_id, model) composite index (E0.1)

Revision ID: 0034
Revises: 0033
Create Date: 2026-09-25

safe_invoke reuses the same request_id across primary/fallback attempts
in a chain — with request_id as the sole PK, the second attempt's content
row silently replaced the first (ON CONFLICT DO NOTHING), losing the
successful reply when the primary also captured. UUID PK + composite
index lets both attempts coexist; the read path disambiguates by model
(the span payload carries it).

Also adds the provider column to persist_stream_log's trace dict (E0.3).
"""

import sqlalchemy as sa
from alembic import op

revision = '0034'
down_revision = '0033'


def upgrade() -> None:
    # Drop the old PK constraint, add id column, set new PK.
    op.execute('ALTER TABLE llm_trace_contents DROP CONSTRAINT llm_trace_contents_pkey')
    op.add_column(
        'llm_trace_contents',
        sa.Column('id', sa.String(36), nullable=False, server_default=sa.text('gen_random_uuid()::text')),
    )
    op.execute('ALTER TABLE llm_trace_contents ADD PRIMARY KEY (id)')
    op.create_index(
        'ix_llm_trace_contents_request_model',
        'llm_trace_contents',
        ['request_id', 'model'],
    )


def downgrade() -> None:
    op.drop_index('ix_llm_trace_contents_request_model', table_name='llm_trace_contents')
    op.execute('ALTER TABLE llm_trace_contents DROP CONSTRAINT llm_trace_contents_pkey')
    op.drop_column('llm_trace_contents', 'id')
    # Deduplicate before restoring PK (keep the earliest row per request_id).
    op.execute("""
        DELETE FROM llm_trace_contents a
        USING llm_trace_contents b
        WHERE a.request_id = b.request_id AND a.created_at > b.created_at
    """)
    op.execute("ALTER TABLE llm_trace_contents ADD PRIMARY KEY (request_id)")
