"""initial — create all tables

Revision ID: 0001
Revises:
Create Date: 2026-04-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enums ---
    annotation_type = postgresql.ENUM(
        'highlight', 'note', 'bookmark',
        name='annotation_type_enum',
        create_type=True,
    )
    book_file_type = postgresql.ENUM(
        'epub', 'pdf',
        name='book_file_type_enum',
        create_type=True,
    )
    book_status = postgresql.ENUM(
        'unread', 'reading', 'completed',
        name='book_status_enum',
        create_type=True,
    )

    annotation_type.create(op.get_bind(), checkfirst=True)
    book_file_type.create(op.get_bind(), checkfirst=True)
    book_status.create(op.get_bind(), checkfirst=True)

    # --- users ---
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('avatar', sa.String(255), nullable=True),
        sa.Column('google_id', sa.String(255), nullable=True),
        sa.Column('settings', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_unique_constraint('uq_users_email', 'users', ['email'])
    op.create_unique_constraint('uq_users_google_id', 'users', ['google_id'])

    # --- books ---
    op.create_table(
        'books',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('author', sa.String(255), nullable=False),
        sa.Column('cover_url', sa.String(255), nullable=True),
        sa.Column('file_type', book_file_type, nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('total_pages', sa.Integer(), server_default='0', nullable=False),
        sa.Column('current_page', sa.Integer(), server_default='0', nullable=False),
        sa.Column('progress', sa.Numeric(5, 2), server_default='0', nullable=False),
        sa.Column('status', book_status, nullable=False),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('added_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('started_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('last_read_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_books_user_id', 'books', ['user_id'])
    op.create_index('ix_books_file_type', 'books', ['file_type'])
    op.create_index('ix_books_status', 'books', ['status'])
    op.create_index('ix_books_user_id_status', 'books', ['user_id', 'status'])
    op.create_index('ix_books_tags_gin', 'books', ['tags'], postgresql_using='gin')
    op.create_index('ix_books_user_id_last_read_at', 'books', ['user_id', 'last_read_at'])
    op.create_index('ix_books_user_id_added_at', 'books', ['user_id', 'added_at'])

    # --- annotations ---
    op.create_table(
        'annotations',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('type', annotation_type, nullable=False),
        sa.Column('location', postgresql.JSONB(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_annotations_user_id', 'annotations', ['user_id'])
    op.create_index('ix_annotations_book_id', 'annotations', ['book_id'])
    op.create_index('ix_annotations_type', 'annotations', ['type'])
    op.create_index('ix_annotations_tags_gin', 'annotations', ['tags'], postgresql_using='gin')
    op.create_index('ix_annotations_user_id_book_id', 'annotations', ['user_id', 'book_id'])
    op.create_index('ix_annotations_user_id_book_id_created_at', 'annotations', ['user_id', 'book_id', 'created_at'])

    # --- api_keys ---
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

    # --- book_clubs ---
    op.create_table(
        'book_clubs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('cover_image', sa.String(255), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('current_book_id', sa.UUID(), nullable=True),
        sa.Column('is_private', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('invite_code', sa.String(6), server_default=sa.text("upper(substring(md5(random()::text), 1, 6))"), nullable=False),
        sa.Column('max_members', sa.Integer(), server_default='20', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['current_book_id'], ['books.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_book_clubs_created_by', 'book_clubs', ['created_by'])
    op.create_index('ix_book_clubs_current_book_id', 'book_clubs', ['current_book_id'])
    op.create_unique_constraint('ix_book_clubs_invite_code', 'book_clubs', ['invite_code'])

    # --- book_club_members ---
    op.create_table(
        'book_club_members',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('club_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(20), server_default='member', nullable=False),
        sa.Column('joined_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['club_id'], ['book_clubs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('club_id', 'user_id', name='uq_club_member'),
    )
    op.create_index('ix_book_club_members_club_id', 'book_club_members', ['club_id'])
    op.create_index('ix_book_club_members_user_id', 'book_club_members', ['user_id'])

    # --- chat_messages ---
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_chat_messages_user_id_book_id', 'chat_messages', ['user_id', 'book_id'])
    op.create_index('ix_chat_messages_user_id_created_at', 'chat_messages', ['user_id', 'created_at'])
    op.create_index('ix_chat_messages_user_id_book_id_created_at', 'chat_messages', ['user_id', 'book_id', 'created_at'])

    # --- club_discussions ---
    op.create_table(
        'club_discussions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('club_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['club_id'], ['book_clubs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_club_discussions_club_created', 'club_discussions', ['club_id', 'created_at'])

    # --- collections ---
    op.create_table(
        'collections',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('icon', sa.String(255), server_default='folder', nullable=False),
        sa.Column('color', sa.String(255), server_default='#f59e0b', nullable=False),
        sa.Column('book_ids', postgresql.ARRAY(sa.UUID()), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_collections_user_id', 'collections', ['user_id'])
    op.create_index('ix_collections_book_ids_gin', 'collections', ['book_ids'], postgresql_using='gin')

    # --- documents ---
    op.create_table(
        'documents',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('chapters', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_documents_book_id', 'documents', ['book_id'])
    op.create_index('ix_documents_user_id', 'documents', ['user_id'])

    # --- flashcards ---
    op.create_table(
        'flashcards',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('annotation_id', sa.UUID(), nullable=True),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('ease_factor', sa.Float(), server_default='2.5', nullable=False),
        sa.Column('interval', sa.Integer(), server_default='0', nullable=False),
        sa.Column('repetition_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('next_review_at', sa.TIMESTAMP(), nullable=False),
        sa.Column('last_review_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('last_rating', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['annotation_id'], ['annotations.id'], ondelete='SET NULL'),
        sa.CheckConstraint('last_rating >= 0 AND last_rating <= 5', name='ck_flashcards_last_rating_range'),
    )
    op.create_index('ix_flashcards_user_id', 'flashcards', ['user_id'])
    op.create_index('ix_flashcards_book_id', 'flashcards', ['book_id'])
    op.create_index('ix_flashcards_annotation_id', 'flashcards', ['annotation_id'])
    op.create_index('ix_flashcards_user_id_next_review_at', 'flashcards', ['user_id', 'next_review_at'])

    # --- friend_conversations ---
    op.create_table(
        'friend_conversations',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('persona', sa.String(20), nullable=False),
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('emotion', sa.String(30), nullable=True),
        sa.Column('context', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_friend_conv_user_created', 'friend_conversations', ['user_id', 'created_at'])
    op.create_index('ix_friend_conv_user_persona', 'friend_conversations', ['user_id', 'persona'])

    # --- friend_relationships ---
    op.create_table(
        'friend_relationships',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('persona', sa.String(20), server_default='sage', nullable=False),
        sa.Column('books_read_together', sa.Integer(), server_default='0', nullable=False),
        sa.Column('shared_moments', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('total_messages', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_interaction_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_unique_constraint('uq_friend_relationships_user_id', 'friend_relationships', ['user_id'])

    # --- intervention_feedback ---
    op.create_table(
        'intervention_feedback',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=True),
        sa.Column('intervention_type', sa.String(50), nullable=False),
        sa.Column('helpful', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('dismissed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('context', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_intervention_feedback_user_id', 'intervention_feedback', ['user_id'])
    op.create_index('ix_intervention_feedback_intervention_type', 'intervention_feedback', ['intervention_type'])
    op.create_index('ix_intervention_feedback_helpful', 'intervention_feedback', ['helpful'])

    # --- memory_books ---
    op.create_table(
        'memory_books',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('format', sa.String(20), server_default='scrapbook', nullable=False),
        sa.Column('moments', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('insights', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('stats', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('sections', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('html_content', sa.Text(), nullable=True),
        sa.Column('generated_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'book_id', name='uq_memory_books_user_book'),
    )
    op.create_index('ix_memory_books_user_id', 'memory_books', ['user_id'])
    op.create_index('ix_memory_books_book_id', 'memory_books', ['book_id'])

    # --- notifications ---
    op.create_table(
        'notifications',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('type', sa.String(32), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'read'])
    op.create_index('ix_notifications_user_type', 'notifications', ['user_id', 'type'])
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at'])

    # --- reading_sessions ---
    op.create_table(
        'reading_sessions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('started_at', sa.TIMESTAMP(), nullable=False),
        sa.Column('ended_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('duration', sa.Integer(), server_default='0', nullable=False),
        sa.Column('pages_read', sa.Integer(), server_default='0', nullable=False),
        sa.Column('highlights', sa.Integer(), server_default='0', nullable=False),
        sa.Column('notes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_reading_sessions_user_id', 'reading_sessions', ['user_id'])
    op.create_index('ix_reading_sessions_book_id', 'reading_sessions', ['book_id'])
    op.create_index('ix_reading_sessions_user_id_is_active', 'reading_sessions', ['user_id', 'is_active'])
    op.create_index('ix_reading_sessions_user_id_book_id', 'reading_sessions', ['user_id', 'book_id'])
    op.create_index('ix_reading_sessions_user_id_started_at', 'reading_sessions', ['user_id', 'started_at'])

    # --- shared_exports ---
    op.create_table(
        'shared_exports',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('book_id', sa.UUID(), nullable=False),
        sa.Column('token', sa.String(255), nullable=False),
        sa.Column('format', sa.String(255), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('content_type', sa.String(255), server_default='text/markdown; charset=utf-8', nullable=False),
        sa.Column('view_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_shared_exports_user_id', 'shared_exports', ['user_id'])
    op.create_index('ix_shared_exports_book_id', 'shared_exports', ['book_id'])
    op.create_unique_constraint('uq_shared_exports_token', 'shared_exports', ['token'])
    op.create_index('ix_shared_exports_token', 'shared_exports', ['token'])

    # --- webhooks ---
    op.create_table(
        'webhooks',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('url', sa.String(2048), nullable=False),
        sa.Column('events', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('secret', sa.String(64), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('last_delivery_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('last_delivery_status', sa.Integer(), nullable=True),
        sa.Column('failure_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_webhooks_user_id', 'webhooks', ['user_id'])
    op.create_index('ix_webhooks_is_active', 'webhooks', ['is_active'])

    # --- webhook_delivery_logs ---
    op.create_table(
        'webhook_delivery_logs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('webhook_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('event', sa.String(50), nullable=False),
        sa.Column('url', sa.String(2048), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['webhook_id'], ['webhooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_webhook_delivery_logs_webhook_id', 'webhook_delivery_logs', ['webhook_id'])
    op.create_index('ix_webhook_delivery_logs_user_id', 'webhook_delivery_logs', ['user_id'])
    op.create_index('ix_wh_delivery_created', 'webhook_delivery_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('webhook_delivery_logs')
    op.drop_table('webhooks')
    op.drop_table('shared_exports')
    op.drop_table('reading_sessions')
    op.drop_table('notifications')
    op.drop_table('memory_books')
    op.drop_table('intervention_feedback')
    op.drop_table('friend_relationships')
    op.drop_table('friend_conversations')
    op.drop_table('flashcards')
    op.drop_table('documents')
    op.drop_table('collections')
    op.drop_table('club_discussions')
    op.drop_table('book_club_members')
    op.drop_table('chat_messages')
    op.drop_table('book_clubs')
    op.drop_table('api_keys')
    op.drop_table('annotations')
    op.drop_table('books')
    op.drop_table('users')

    postgresql.ENUM(name='annotation_type_enum').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='book_file_type_enum').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='book_status_enum').drop(op.get_bind(), checkfirst=True)
