/**
 * Migration 002: Performance Indexes
 *
 * Adds missing indexes for frequently queried columns.
 * Based on query analysis of routes and services.
 */

import { QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // Annotations: GIN index on tags for array overlap/contains queries
  await qi.addIndex('annotations', ['tags'], {
    name: 'idx_annotations_tags_gin',
    using: 'GIN',
    concurrently: true,
  }).catch(() => {
    // GIN index may already exist or require superuser — non-fatal
  });

  // Annotations: composite index for user+book (most common filter combo)
  await qi.addIndex('annotations', ['userId', 'bookId'], {
    name: 'idx_annotations_user_book',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Annotations: index on createdAt for ordering
  await qi.addIndex('annotations', ['createdAt'], {
    name: 'idx_annotations_created_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Books: index on lastReadAt for recent-books and calendar queries
  await qi.addIndex('books', ['lastReadAt'], {
    name: 'idx_books_last_read_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Books: index on addedAt for sorting
  await qi.addIndex('books', ['addedAt'], {
    name: 'idx_books_added_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Reading sessions: composite for calendar queries
  await qi.addIndex('reading_sessions', ['userId', 'startedAt'], {
    name: 'idx_reading_sessions_user_started',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Reading sessions: index on startedAt for date-range queries
  await qi.addIndex('reading_sessions', ['startedAt'], {
    name: 'idx_reading_sessions_started_at',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Chat messages: composite for history fetch
  await qi.addIndex('chat_messages', ['userId', 'bookId', 'createdAt'], {
    name: 'idx_chat_messages_user_book_created',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Friend conversations: composite for persona history
  await qi.addIndex('friend_conversations', ['userId', 'persona', 'createdAt'], {
    name: 'idx_friend_conv_user_persona_created',
    concurrently: true,
  }).catch(() => { /* may already exist */ });

  // Memory books: unique composite already defined in model, ensure it exists
  await qi.addIndex('memory_books', ['userId', 'bookId'], {
    name: 'idx_memory_books_user_book',
    concurrently: true,
  }).catch(() => { /* may already exist */ });
}

export async function down(qi: QueryInterface): Promise<void> {
  const indexes = [
    'idx_annotations_tags_gin',
    'idx_annotations_user_book',
    'idx_annotations_created_at',
    'idx_books_last_read_at',
    'idx_books_added_at',
    'idx_reading_sessions_user_started',
    'idx_reading_sessions_started_at',
    'idx_chat_messages_user_book_created',
    'idx_friend_conv_user_persona_created',
    'idx_memory_books_user_book',
  ];

  for (const name of indexes) {
    await qi.removeIndex('annotations', name).catch(() => {});
    await qi.removeIndex('books', name).catch(() => {});
    await qi.removeIndex('reading_sessions', name).catch(() => {});
    await qi.removeIndex('chat_messages', name).catch(() => {});
    await qi.removeIndex('friend_conversations', name).catch(() => {});
    await qi.removeIndex('memory_books', name).catch(() => {});
  }
}
