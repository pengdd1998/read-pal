/**
 * Migration 010: webhooks table
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('webhooks', {
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
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
    },
    events: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    secret: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_delivery_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_delivery_status: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    failure_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await qi.addIndex('webhooks', ['user_id']);
  await qi.addIndex('webhooks', ['is_active']);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('webhooks');
}
