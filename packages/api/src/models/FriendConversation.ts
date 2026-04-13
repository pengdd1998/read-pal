/**
 * FriendConversation Model
 *
 * Stores conversation history and relationship data for the Reading Friend.
 * Unlike ChatMessage (book-scoped), this is persona-scoped and persists
 * relationship context across sessions.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface FriendConversationAttributes {
  id: string;
  userId: string;
  persona: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  context?: object;
  createdAt: Date;
}

interface FriendConversationCreationAttributes
  extends Optional<FriendConversationAttributes, 'id' | 'createdAt' | 'emotion' | 'context'> {}

export class FriendConversation
  extends Model<FriendConversationAttributes, FriendConversationCreationAttributes>
  implements FriendConversationAttributes
{
  public id!: string;
  public userId!: string;
  public persona!: string;
  public role!: 'user' | 'assistant';
  public content!: string;
  public emotion?: string;
  public context?: object;
  public createdAt!: Date;
}

FriendConversation.init(
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
    persona: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['sage', 'penny', 'alex', 'quinn', 'sam']] },
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
    emotion: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'friend_conversations',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['userId', 'createdAt'] },
      { fields: ['userId', 'persona'] },
    ],
  }
);

/**
 * FriendRelationship Model
 *
 * Stores per-user relationship metadata: which persona they use,
 * how many books read together, shared moments, etc.
 */

interface FriendRelationshipAttributes {
  id: string;
  userId: string;
  persona: string;
  booksReadTogether: number;
  sharedMoments: object[];
  totalMessages: number;
  lastInteractionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FriendRelationshipCreationAttributes
  extends Optional<FriendRelationshipAttributes, 'id' | 'createdAt' | 'updatedAt' | 'lastInteractionAt'> {}

export class FriendRelationship
  extends Model<FriendRelationshipAttributes, FriendRelationshipCreationAttributes>
  implements FriendRelationshipAttributes
{
  public id!: string;
  public userId!: string;
  public persona!: string;
  public booksReadTogether!: number;
  public sharedMoments!: object[];
  public totalMessages!: number;
  public lastInteractionAt?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;
}

FriendRelationship.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    persona: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'sage',
      validate: { isIn: [['sage', 'penny', 'alex', 'quinn', 'sam']] },
    },
    booksReadTogether: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sharedMoments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    totalMessages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastInteractionAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'friend_relationships',
    timestamps: true,
    indexes: [
      { fields: ['userId'], unique: true },
    ],
  }
);
