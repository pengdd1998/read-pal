/**
 * Migration 006: Add notifications table
 *
 * Persistent storage for in-app notifications:
 * streak milestones, reading reminders, goal achievements.
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('notifications', {
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
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    read: {
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

  await qi.addIndex('notifications', ['user_id'], { name: 'notifications_user_id_idx' });
  await qi.addIndex('notifications', ['user_id', 'read'], { name: 'notifications_user_read_idx' });
  await qi.addIndex('notifications', ['user_id', 'type'], { name: 'notifications_user_type_idx' });
  await qi.addIndex('notifications', ['user_id', 'created_at'], { name: 'notifications_user_created_idx' });

  console.log('[migration:006] Created notifications table');
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('notifications');
  console.log('[migration:006] Dropped notifications table');
}
