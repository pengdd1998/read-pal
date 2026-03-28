/**
 * Book Model
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface BookAttributes {
  id: string;
  userId: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileType: 'epub' | 'pdf';
  fileSize: number;
  totalPages: number;
  currentPage: number;
  progress: number;
  status: 'unread' | 'reading' | 'completed';
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastReadAt?: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface BookCreationAttributes extends Optional<BookAttributes, 'id' | 'coverUrl' | 'startedAt' | 'completedAt' | 'lastReadAt' | 'metadata' | 'createdAt' | 'updatedAt'> {}

export class Book extends Model<BookAttributes, BookCreationAttributes> implements BookAttributes {
  public id!: string;
  public userId!: string;
  public title!: string;
  public author!: string;
  public coverUrl?: string;
  public fileType!: 'epub' | 'pdf';
  public fileSize!: number;
  public totalPages!: number;
  public currentPage!: number;
  public progress!: number;
  public status!: 'unread' | 'reading' | 'completed';
  public addedAt!: Date;
  public startedAt?: Date;
  public completedAt?: Date;
  public lastReadAt?: Date;
  public metadata?: any;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Book.init(
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
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    author: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    coverUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fileType: {
      type: DataTypes.ENUM('epub', 'pdf'),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    totalPages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    currentPage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    progress: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('unread', 'reading', 'completed'),
      allowNull: false,
      defaultValue: 'unread',
    },
    addedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
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
    tableName: 'books',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['fileType'] },
    ],
  }
);
