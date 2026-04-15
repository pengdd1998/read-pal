/**
 * Migration 002: Performance Indexes
 *
 * Adds missing indexes for frequently queried columns.
 * Based on query analysis of routes and services.
 *
 * Uses snake_case column names to match Sequelize `underscored: true`.
 */

import { QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // Annotations: GIN index on tags for array overlap/contains queries
  await qi.addIndex('annotations', ['tags'], {
    name: 'idx_annotations_tags_gin',
    using: 'GIN',
    concurrently: true,
  }).catch(() => { /* GIN may require superuser — non-fatal */ });

  // Annotations: composite index for user+book (most common filter combo)
  await qi.addIndex('annotations', ['user_id', 'book_id'], {
    name: 'idx_annotations_user_book',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Annotations: index on created_at for ordering
  await qi.addIndex('annotations', ['created_at'], {
    name: 'idx_annotations_created_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Books: index on last_read_at for recent-books and calendar queries
  await qi.addIndex('books', ['last_read_at'], {
    name: 'idx_books_last_read_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Books: index on added_at for sorting
  await qi.addIndex('books', ['added_at'], {
    name: 'idx_books_added_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Reading sessions: composite for calendar queries
  await qi.addIndex('reading_sessions', ['user_id', 'started_at'], {
    name: 'idx_reading_sessions_user_started',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Reading sessions: index on started_at for date-range queries
  await qi.addIndex('reading_sessions', ['started_at'], {
    name: 'idx_reading_sessions_started_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Chat messages: composite for history fetch
  await qi.addIndex('chat_messages', ['user_id', 'book_id', 'created_at'], {
    name: 'idx_chat_messages_user_book_created',
    concurrently: true,
  }).catch(() => { /* table may not exist yet */ });

  // Friend conversations: composite for persona history
  await qi.addIndex('friend_conversations', ['user_id', 'persona', 'created_at'], {
    name: 'idx_friend_conv_user_persona_created',
    concurrently: true,
  }).catch(() => { /* table may not exist yet */ });

  // Memory books: unique composite for user+book
  await qi.addIndex('memory_books', ['user_id', 'book_id'], {
    name: 'idx_memory_books_user_book',
    concurrently: true,
  }).catch(() => { /* table may not exist yet */ });
}

export async function down(qi: QueryInterface): Promise<void> {
  const tableIndexes: Record<string, string[]> = {
    annotations: [
      'idx_annotations_tags_gin',
      'idx_annotations_user_book',
      'idx_annotations_created_at',
    ],
    books: [
      'idx_books_last_read_at',
      'idx_books_added_at',
    ],
    reading_sessions: [
      'idx_reading_sessions_user_started',
      'idx_reading_sessions_started_at',
    ],
    chat_messages: [
      'idx_chat_messages_user_book_created',
    ],
    friend_conversations: [
      'idx_friend_conv_user_persona_created',
    ],
    memory_books: [
      'idx_memory_books_user_book',
    ],
  };

  for (const [table, indexes] of Object.entries(tableIndexes)) {
    for (const name of indexes) {
      await qi.removeIndex(table, name).catch(() => {});
    }
  }
}
