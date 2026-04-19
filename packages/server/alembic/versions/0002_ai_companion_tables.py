"""add ai companion tables — conversation_summaries, ai_feedback, reading_plans

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Conversation summaries — compressed chat history
    op.create_table(
        'conversation_summaries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'book_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('summary', sa.Text, nullable=False),
        sa.Column('message_count', sa.Integer, server_default='0'),
        sa.Column(
            'created_at', sa.DateTime(),
            server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at', sa.DateTime(),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        'ix_conv_summaries_user_book',
        'conversation_summaries',
        ['user_id', 'book_id'],
    )

    # AI feedback — thumbs up/down
    op.create_table(
        'ai_feedback',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'book_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('message_id', sa.Text, nullable=True),
        sa.Column('rating', sa.Boolean, nullable=False),
        sa.Column('comment', sa.Text, nullable=True),
        sa.Column(
            'created_at', sa.DateTime(),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        'ix_ai_feedback_user_id',
        'ai_feedback',
        ['user_id'],
    )
    op.create_index(
        'ix_ai_feedback_book_id',
        'ai_feedback',
        ['book_id'],
    )

    # Reading plans — AI-generated schedules
    op.create_table(
        'reading_plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'book_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('plan_text', sa.Text, nullable=False),
        sa.Column('total_days', sa.Integer, server_default='7'),
        sa.Column('current_day', sa.Integer, server_default='1'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column(
            'created_at', sa.DateTime(),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        'ix_reading_plans_user_book',
        'reading_plans',
        ['user_id', 'book_id'],
    )


def downgrade() -> None:
    op.drop_table('reading_plans')
    op.drop_table('ai_feedback')
    op.drop_table('conversation_summaries')
