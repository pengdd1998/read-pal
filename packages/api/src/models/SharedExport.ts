/**
 * SharedExport Model — Public shareable links for annotation exports
 *
 * Stores pre-rendered export content with a unique token so that
 * anyone with the link can view the export without authentication.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface SharedExportAttributes {
  id: string;
  userId: string;
  bookId: string;
  token: string;
  format: string;
  title: string;
  content: string;
  contentType: string;
  viewCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SharedExportCreationAttributes extends Optional<SharedExportAttributes, 'id' | 'viewCount' | 'expiresAt' | 'createdAt' | 'updatedAt'> {}

export class SharedExport extends Model<SharedExportAttributes, SharedExportCreationAttributes> implements SharedExportAttributes {
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public token!: string;
  public format!: string;
  public title!: string;
  public content!: string;
  public contentType!: string;
  public viewCount!: number;
  public expiresAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SharedExport.init(
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
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    format: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'text/markdown; charset=utf-8',
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    expiresAt: {
      type: DataTypes.DATE,
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
    tableName: 'shared_exports',
    timestamps: true,
    indexes: [
      { fields: ['token'], unique: true },
      { fields: ['user_id'] },
      { fields: ['book_id'] },
    ],
  }
);
