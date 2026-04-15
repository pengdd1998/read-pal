/**
 * Migration 001: Initial Database Schema
 *
 * Creates core tables for read-pal:
 * - users
 * - books
 * - documents (parsed book content)
 * - annotations
 * - reading_sessions
 *
 * Column names use snake_case (matching Sequelize `underscored: true`).
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ── Users ──────────────────────────────────────────────────────────────────
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        theme: 'system',
        fontSize: 16,
        fontFamily: 'Inter',
        readingGoal: 2,
        notificationsEnabled: true,
      },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('users', ['email'], {
    name: 'users_email_unique',
    unique: true,
  });

  // ── Books ──────────────────────────────────────────────────────────────────
  await queryInterface.createTable('books', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    author: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cover_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_type: {
      type: DataTypes.ENUM('epub', 'pdf'),
      allowNull: false,
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    total_pages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    current_page: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    progress: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('unread', 'reading', 'completed'),
      allowNull: false,
      defaultValue: 'unread',
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    added_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('books', ['user_id'], { name: 'books_user_id_idx' });
  await queryInterface.addIndex('books', ['status'], { name: 'books_status_idx' });
  await queryInterface.addIndex('books', ['file_type'], { name: 'books_file_type_idx' });
  await queryInterface.addIndex('books', ['user_id', 'status'], { name: 'books_user_status_idx' });
  await queryInterface.addIndex('books', ['tags'], { name: 'books_tags_gin', using: 'GIN' });

  // ── Documents (parsed book content) ────────────────────────────────────────
  await queryInterface.createTable('documents', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    book_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'books', key: 'id' },
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    chapters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('documents', ['book_id'], { name: 'documents_book_id_idx' });
  await queryInterface.addIndex('documents', ['user_id'], { name: 'documents_user_id_idx' });

  // ── Annotations ────────────────────────────────────────────────────────────
  await queryInterface.createTable('annotations', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    book_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'books', key: 'id' },
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('highlight', 'note', 'bookmark'),
      allowNull: false,
    },
    location: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('annotations', ['user_id'], { name: 'annotations_user_id_idx' });
  await queryInterface.addIndex('annotations', ['book_id'], { name: 'annotations_book_id_idx' });
  await queryInterface.addIndex('annotations', ['type'], { name: 'annotations_type_idx' });
  await queryInterface.addIndex('annotations', ['tags'], { name: 'annotations_tags_gin', using: 'GIN' });

  // ── Reading Sessions ───────────────────────────────────────────────────────
  await queryInterface.createTable('reading_sessions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    book_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'books', key: 'id' },
      onDelete: 'CASCADE',
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pages_read: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    highlights: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex('reading_sessions', ['user_id'], { name: 'reading_sessions_user_id_idx' });
  await queryInterface.addIndex('reading_sessions', ['book_id'], { name: 'reading_sessions_book_id_idx' });
  await queryInterface.addIndex('reading_sessions', ['started_at'], { name: 'reading_sessions_started_at_idx' });
  await queryInterface.addIndex('reading_sessions', ['user_id', 'is_active'], { name: 'reading_sessions_user_active_idx' });
  await queryInterface.addIndex('reading_sessions', ['user_id', 'book_id'], { name: 'reading_sessions_user_book_idx' });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('reading_sessions');
  await queryInterface.dropTable('annotations');
  await queryInterface.dropTable('documents');
  await queryInterface.dropTable('books');
  await queryInterface.dropTable('users');
}
