/**
 * Notification Model
 *
 * Persistent in-app notifications for streak milestones,
 * reading reminders, goal achievements, and system messages.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

type NotificationType = 'streak_milestone' | 'streak_at_risk' | 'reading_reminder' | 'goal_achieved' | 'system';

interface NotificationAttributes {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationCreationAttributes extends Optional<NotificationAttributes, 'id' | 'metadata' | 'read' | 'createdAt' | 'updatedAt'> {}

export class Notification extends Model<NotificationAttributes, NotificationCreationAttributes> implements NotificationAttributes {
  public id!: string;
  public userId!: string;
  public type!: NotificationType;
  public title!: string;
  public message!: string;
  public metadata?: Record<string, unknown>;
  public read!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Notification.init(
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
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: {
        isIn: [['streak_milestone', 'streak_at_risk', 'reading_reminder', 'goal_achieved', 'system']],
      },
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'notifications',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'read'] },
      { fields: ['user_id', 'type'] },
      { fields: ['user_id', 'created_at'] },
    ],
  }
);
