/**
 * Annotation Model
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

export interface AnnotationLocation {
  pageNumber?: number;
  cfi?: string;
  startOffset?: number;
  endOffset?: number;
  chapterIndex?: number;
  [key: string]: unknown;
}

interface AnnotationAttributes {
  id: string;
  userId: string;
  bookId: string;
  type: 'highlight' | 'note' | 'bookmark';
  location: AnnotationLocation;
  content: string;
  color?: string;
  note?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface AnnotationCreationAttributes extends Optional<AnnotationAttributes, 'id' | 'color' | 'note' | 'tags' | 'createdAt' | 'updatedAt'> {}

export class Annotation extends Model<AnnotationAttributes, AnnotationCreationAttributes> implements AnnotationAttributes {
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public type!: 'highlight' | 'note' | 'bookmark';
  public location!: AnnotationLocation;
  public content!: string;
  public color?: string;
  public note?: string;
  public tags?: string[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Annotation.init(
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
    type: {
      type: DataTypes.ENUM('highlight', 'note', 'bookmark'),
      allowNull: false,
    },
    location: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
    tableName: 'annotations',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['book_id'] },
      { fields: ['type'] },
      { fields: ['tags'], using: 'GIN' },
    ],
  }
);
