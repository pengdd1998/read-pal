/**
 * Migration 009: api_keys table
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('api_keys', {
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    key_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    key_prefix: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
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

  await qi.addIndex('api_keys', ['user_id']);
  await qi.addIndex('api_keys', ['key_hash'], { unique: true });
  await qi.addIndex('api_keys', ['key_prefix']);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('api_keys');
}
