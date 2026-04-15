/**
 * MemoryBook Model
 *
 * Compilations of a user's reading journey for a specific book,
 * capturing highlights, annotations, insights, agent conversations,
 * and key moments.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

// ---------------------------------------------------------------------------
// JSONB sub-types (for documentation; not enforced at the DB level)
// ---------------------------------------------------------------------------

export interface MemoryBookMoment {
  type: string;
  content: string;
  timestamp: string;
  chapterIndex: number;
}

export interface MemoryBookInsight {
  theme: string;
  description: string;
  relatedConcepts: string[];
}

export interface MemoryBookStats {
  pagesRead: number;
  totalHighlights: number;
  totalNotes: number;
  readingDuration: number;
  conceptsDiscovered: number;
  connectionsMade: number;
}

// ---------------------------------------------------------------------------
// Model attributes
// ---------------------------------------------------------------------------

interface MemoryBookAttributes {
  id: string;
  userId: string;
  bookId: string;
  title: string;
  format: 'scrapbook' | 'journal' | 'timeline' | 'podcast';
  moments: MemoryBookMoment[];
  insights: MemoryBookInsight[];
  stats: MemoryBookStats;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryBookCreationAttributes
  extends Optional<
    MemoryBookAttributes,
    'id' | 'moments' | 'insights' | 'generatedAt' | 'createdAt' | 'updatedAt'
  > {}

// ---------------------------------------------------------------------------
// Sequelize Model
// ---------------------------------------------------------------------------

export class MemoryBook
  extends Model<MemoryBookAttributes, MemoryBookCreationAttributes>
  implements MemoryBookAttributes
{
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public title!: string;
  public format!: 'scrapbook' | 'journal' | 'timeline' | 'podcast';
  public moments!: MemoryBookMoment[];
  public insights!: MemoryBookInsight[];
  public stats!: MemoryBookStats;
  public generatedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MemoryBook.init(
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
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    format: {
      type: DataTypes.ENUM('scrapbook', 'journal', 'timeline', 'podcast'),
      allowNull: false,
      defaultValue: 'scrapbook',
    },
    moments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    insights: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    stats: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        pagesRead: 0,
        totalHighlights: 0,
        totalNotes: 0,
        readingDuration: 0,
        conceptsDiscovered: 0,
        connectionsMade: 0,
      },
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: 'memory_books',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['book_id'] },
      {
        unique: true,
        fields: ['user_id', 'book_id'],
      },
    ],
  },
);
