/**
 * ChatMessage Model
 *
 * Stores conversation history between users and their Reading Friend.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface ChatMessageAttributes {
  id: string;
  userId: string;
  bookId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatMessageCreationAttributes extends Optional<ChatMessageAttributes, 'id' | 'createdAt'> {}

export class ChatMessage extends Model<ChatMessageAttributes, ChatMessageCreationAttributes> implements ChatMessageAttributes {
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public role!: 'user' | 'assistant';
  public content!: string;
  public createdAt!: Date;
}

ChatMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    bookId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { isIn: [['user', 'assistant']] },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'chat_messages',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['userId', 'bookId'] },
      { fields: ['userId', 'createdAt'] },
      { fields: ['userId', 'bookId', 'createdAt'] },
    ],
  },
);
