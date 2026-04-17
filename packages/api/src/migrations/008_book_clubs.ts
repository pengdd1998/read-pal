/**
 * Migration 008: Add book_clubs and book_club_members tables
 *
 * Reading groups / book clubs with invite codes and role-based access.
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // book_clubs
  await qi.createTable('book_clubs', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cover_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    current_book_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'books', key: 'id' },
      onDelete: 'SET NULL',
    },
    is_private: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    invite_code: {
      type: DataTypes.STRING(6),
      allowNull: false,
      unique: true,
    },
    max_members: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
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

  await qi.addIndex('book_clubs', ['created_by'], { name: 'book_clubs_created_by_idx' });
  await qi.addIndex('book_clubs', ['invite_code'], { name: 'book_clubs_invite_code_idx', unique: true });
  await qi.addIndex('book_clubs', ['current_book_id'], { name: 'book_clubs_current_book_idx' });
  await qi.addIndex('book_clubs', ['is_private'], { name: 'book_clubs_is_private_idx' });

  // book_club_members
  await qi.createTable('book_club_members', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    club_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'book_clubs', key: 'id' },
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'member',
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await qi.addIndex('book_club_members', ['club_id'], { name: 'bcm_club_id_idx' });
  await qi.addIndex('book_club_members', ['user_id'], { name: 'bcm_user_id_idx' });
  await qi.addIndex('book_club_members', ['club_id', 'user_id'], { name: 'bcm_club_user_unique_idx', unique: true });

  console.log('[migration:008] Created book_clubs and book_club_members tables');

  // club_discussions
  await qi.createTable('club_discussions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    club_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'book_clubs', key: 'id' },
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

  await qi.addIndex('club_discussions', ['club_id', 'created_at'], { name: 'cd_club_created_idx' });
  await qi.addIndex('club_discussions', ['user_id'], { name: 'cd_user_id_idx' });

  console.log('[migration:008] Created club_discussions table');
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('club_discussions');
  await qi.dropTable('book_club_members');
  await qi.dropTable('book_clubs');
  console.log('[migration:008] Dropped club_discussions, book_club_members, and book_clubs tables');
}
