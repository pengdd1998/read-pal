/**
 * User Model
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

export interface UserSettings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  readingGoal: number;
  dailyReadingMinutes: number;
  notificationsEnabled: boolean;
  friendPersona?: string;
  friendFrequency?: string;
  [key: string]: unknown;
}

interface UserAttributes {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  avatar?: string;
  googleId?: string;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'passwordHash' | 'avatar' | 'googleId' | 'createdAt' | 'updatedAt'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public name!: string;
  public passwordHash?: string;
  public avatar?: string;
  public googleId?: string;
  public settings!: UserSettings;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        theme: 'system',
        fontSize: 16,
        fontFamily: 'Inter',
        readingGoal: 2,
        notificationsEnabled: true,
      },
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
    tableName: 'users',
    timestamps: true,
    indexes: [
      {
        fields: ['email'],
      },
      {
        fields: ['google_id'],
        unique: true,
      },
    ],
  }
);
