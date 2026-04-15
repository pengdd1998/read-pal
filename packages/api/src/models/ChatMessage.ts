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
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    bookId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'books',
        key: 'id',
      },
      onDelete: 'CASCADE',
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
      { fields: ['user_id', 'book_id'] },
      { fields: ['user_id', 'created_at'] },
      { fields: ['user_id', 'book_id', 'created_at'] },
    ],
  },
);
