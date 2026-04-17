import { DataTypes, QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable('webhook_delivery_logs', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    webhook_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'webhooks', key: 'id' },
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    event: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
    },
    status_code: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error: {
      type: DataTypes.TEXT,
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

  await qi.addIndex('webhook_delivery_logs', ['webhook_id']);
  await qi.addIndex('webhook_delivery_logs', ['user_id']);
  await qi.addIndex('webhook_delivery_logs', ['created_at']);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('webhook_delivery_logs');
}

export const id = '011';
