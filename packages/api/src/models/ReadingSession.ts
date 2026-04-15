/**
 * ReadingSession Model
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface ReadingSessionAttributes {
  id: string;
  userId: string;
  bookId: string;
  startedAt: Date;
  endedAt?: Date;
  duration: number;
  pagesRead: number;
  highlights: number;
  notes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ReadingSessionCreationAttributes extends Optional<ReadingSessionAttributes, 'id' | 'endedAt' | 'isActive' | 'createdAt' | 'updatedAt'> {}

export class ReadingSession extends Model<ReadingSessionAttributes, ReadingSessionCreationAttributes> implements ReadingSessionAttributes {
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public startedAt!: Date;
  public endedAt?: Date;
  public duration!: number;
  public pagesRead!: number;
  public highlights!: number;
  public notes!: number;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ReadingSession.init(
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
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pagesRead: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    highlights: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
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
    tableName: 'reading_sessions',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['book_id'] },
      { fields: ['started_at'] },
      { fields: ['user_id', 'is_active'] },
      { fields: ['user_id', 'book_id'] },
      // Covers DATE(started_at) GROUP BY queries for calendar/streak
      { fields: ['user_id', 'started_at'] },
    ],
  }
);
