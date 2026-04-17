/**
 * ApiKey Model — Personal access tokens for programmatic API access
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';
import crypto from 'node:crypto';

interface ApiKeyAttributes {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ApiKeyCreationAttributes extends Optional<ApiKeyAttributes, 'id' | 'lastUsedAt' | 'createdAt' | 'updatedAt'> {}

export class ApiKey extends Model<ApiKeyAttributes, ApiKeyCreationAttributes> implements ApiKeyAttributes {
  public id!: string;
  public userId!: string;
  public name!: string;
  public keyHash!: string;
  public keyPrefix!: string;
  public lastUsedAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

const API_KEY_PREFIX = 'rpk_';

export function generateApiKey(): { plainKey: string; keyHash: string; keyPrefix: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const plainKey = `${API_KEY_PREFIX}${raw}`;
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const keyPrefix = plainKey.substring(0, 10); // "rpk_" + first 6 chars
  return { plainKey, keyHash, keyPrefix };
}

export function hashApiKey(plainKey: string): string {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

export function isApiKeyFormat(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

ApiKey.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: { len: [1, 100] },
    },
    keyHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    keyPrefix: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'api_keys',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['key_hash'], unique: true },
      { fields: ['key_prefix'] },
    ],
  }
);
