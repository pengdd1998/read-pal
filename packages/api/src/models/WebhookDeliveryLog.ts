/**
 * WebhookDeliveryLog Model — tracks individual webhook delivery attempts
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';
import type { WebhookEvent } from './Webhook';

interface WebhookDeliveryLogAttributes {
  id: string;
  webhookId: string;
  userId: string;
  event: WebhookEvent;
  url: string;
  statusCode: number | null;
  durationMs: number;
  error: string | null;
  createdAt: Date;
}

interface WebhookDeliveryLogCreationAttributes extends Optional<WebhookDeliveryLogAttributes, 'id' | 'statusCode' | 'error' | 'createdAt'> {}

export class WebhookDeliveryLog extends Model<WebhookDeliveryLogAttributes, WebhookDeliveryLogCreationAttributes> implements WebhookDeliveryLogAttributes {
  public id!: string;
  public webhookId!: string;
  public userId!: string;
  public event!: WebhookEvent;
  public url!: string;
  public statusCode!: number | null;
  public durationMs!: number;
  public error!: string | null;
  public readonly createdAt!: Date;
}

WebhookDeliveryLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    webhookId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'webhooks', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: {
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
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'webhook_delivery_logs',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['webhook_id'] },
      { fields: ['user_id'] },
      { fields: ['created_at'] },
    ],
  }
);
