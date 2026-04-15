/**
 * Migration 003: Missing Tables
 *
 * Creates tables defined in Sequelize models but absent from migration 001:
 * - chat_messages
 * - memory_books
 * - intervention_feedback
 * - friend_conversations
 * - friend_relationships
 *
 * Column names use snake_case (Sequelize `underscored: true`).
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // ── Chat Messages ──────────────────────────────────────────────────────────
  await qi.createTable('chat_messages', {
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
    role: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  await qi.addIndex('chat_messages', ['user_id', 'book_id'], { name: 'chat_messages_user_book_idx' });
  await qi.addIndex('chat_messages', ['user_id', 'created_at'], { name: 'chat_messages_user_created_idx' });
  await qi.addIndex('chat_messages', ['user_id', 'book_id', 'created_at'], { name: 'chat_messages_user_book_created_idx' });

  // ── Memory Books ───────────────────────────────────────────────────────────
  await qi.createTable('memory_books', {
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
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    format: {
      type: DataTypes.ENUM('scrapbook', 'journal', 'timeline', 'podcast'),
      allowNull: false,
      defaultValue: 'scrapbook',
    },
    moments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    insights: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    stats: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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

  await qi.addIndex('memory_books', ['user_id'], { name: 'memory_books_user_id_idx' });
  await qi.addIndex('memory_books', ['book_id'], { name: 'memory_books_book_id_idx' });
  await qi.addIndex('memory_books', ['user_id', 'book_id'], {
    name: 'memory_books_user_book_unique',
    unique: true,
  });

  // ── Intervention Feedback ──────────────────────────────────────────────────
  await qi.createTable('intervention_feedback', {
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
      allowNull: true,
      references: { model: 'books', key: 'id' },
      onDelete: 'SET NULL',
    },
    intervention_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    helpful: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    dismissed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.addIndex('intervention_feedback', ['user_id'], { name: 'intervention_feedback_user_id_idx' });
  await qi.addIndex('intervention_feedback', ['intervention_type'], { name: 'intervention_feedback_type_idx' });
  await qi.addIndex('intervention_feedback', ['helpful'], { name: 'intervention_feedback_helpful_idx' });
  await qi.addIndex('intervention_feedback', ['created_at'], { name: 'intervention_feedback_created_at_idx' });

  // ── Friend Conversations ───────────────────────────────────────────────────
  await qi.createTable('friend_conversations', {
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
    persona: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    emotion: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    context: {
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
      allowNull: true,
    },
  });

  await qi.addIndex('friend_conversations', ['user_id', 'created_at'], { name: 'friend_conv_user_created_idx' });
  await qi.addIndex('friend_conversations', ['user_id', 'persona'], { name: 'friend_conv_user_persona_idx' });

  // ── Friend Relationships ───────────────────────────────────────────────────
  await qi.createTable('friend_relationships', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    persona: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'sage',
    },
    books_read_together: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    shared_moments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    total_messages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_interaction_at: {
      type: DataTypes.DATE,
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

  await qi.addIndex('friend_relationships', ['user_id'], {
    name: 'friend_relationships_user_id_unique',
    unique: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('friend_relationships');
  await queryInterface.dropTable('friend_conversations');
  await queryInterface.dropTable('intervention_feedback');
  await queryInterface.dropTable('memory_books');
  await queryInterface.dropTable('chat_messages');
}
