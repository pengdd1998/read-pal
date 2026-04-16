/**
 * Collection Model — User-created bookshelves/groups
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface CollectionAttributes {
  id: string;
  userId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  bookIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface CollectionCreationAttributes extends Optional<CollectionAttributes, 'id' | 'description' | 'icon' | 'color' | 'bookIds' | 'createdAt' | 'updatedAt'> {}

export class Collection extends Model<CollectionAttributes, CollectionCreationAttributes> implements CollectionAttributes {
  public id!: string;
  public userId!: string;
  public name!: string;
  public description?: string;
  public icon?: string;
  public color?: string;
  public bookIds!: string[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Collection.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100],
      },
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [0, 500],
      },
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'folder',
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '#f59e0b',
    },
    bookIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
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
    tableName: 'collections',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['book_ids'], using: 'GIN' },
    ],
  }
);
