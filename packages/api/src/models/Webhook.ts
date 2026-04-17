/**
 * Webhook Model — HTTP callbacks for external integrations
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

export type WebhookEvent =
  | 'annotation.created'
  | 'annotation.updated'
  | 'annotation.deleted'
  | 'book.started'
  | 'book.completed'
  | 'book.updated'
  | 'session.started'
  | 'session.ended'
  | 'flashcard.created'
  | 'flashcard.reviewed';

const VALID_EVENTS: WebhookEvent[] = [
  'annotation.created',
  'annotation.updated',
  'annotation.deleted',
  'book.started',
  'book.completed',
  'book.updated',
  'session.started',
  'session.ended',
  'flashcard.created',
  'flashcard.reviewed',
];

export function isValidWebhookEvent(event: string): event is WebhookEvent {
  return VALID_EVENTS.includes(event as WebhookEvent);
}

export function getValidWebhookEvents(): WebhookEvent[] {
  return [...VALID_EVENTS];
}

interface WebhookAttributes {
  id: string;
  userId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: number | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WebhookCreationAttributes extends Optional<WebhookAttributes, 'id' | 'isActive' | 'lastDeliveryAt' | 'lastDeliveryStatus' | 'failureCount' | 'createdAt' | 'updatedAt'> {}

export class Webhook extends Model<WebhookAttributes, WebhookCreationAttributes> implements WebhookAttributes {
  public id!: string;
  public userId!: string;
  public url!: string;
  public events!: WebhookEvent[];
  public secret!: string;
  public isActive!: boolean;
  public lastDeliveryAt!: Date | null;
  public lastDeliveryStatus!: number | null;
  public failureCount!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Webhook.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
      validate: { isUrl: true },
    },
    events: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidEventArray(value: unknown[]) {
          if (!Array.isArray(value)) throw new Error('events must be an array');
          for (const ev of value) {
            if (!VALID_EVENTS.includes(ev as WebhookEvent)) {
              throw new Error(`Invalid event: ${ev}`);
            }
          }
        },
      },
    },
    secret: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastDeliveryAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastDeliveryStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    failureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'webhooks',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['is_active'] },
    ],
  }
);
