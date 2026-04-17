/**
 * BookClub Model — Reading groups / book clubs
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

// ---------------------------------------------------------------------------
// BookClub
// ---------------------------------------------------------------------------

interface BookClubAttributes {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  createdBy: string;
  currentBookId?: string;
  isPrivate: boolean;
  inviteCode: string;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BookClubCreationAttributes extends Optional<BookClubAttributes, 'id' | 'description' | 'coverImage' | 'currentBookId' | 'isPrivate' | 'inviteCode' | 'maxMembers' | 'createdAt' | 'updatedAt'> {}

export class BookClub extends Model<BookClubAttributes, BookClubCreationAttributes> implements BookClubAttributes {
  public id!: string;
  public name!: string;
  public description?: string;
  public coverImage?: string;
  public createdBy!: string;
  public currentBookId?: string;
  public isPrivate!: boolean;
  public inviteCode!: string;
  public maxMembers!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

BookClub.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { len: [1, 100] },
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: { len: [0, 500] },
    },
    coverImage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    currentBookId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'books', key: 'id' },
      onDelete: 'SET NULL',
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    inviteCode: {
      type: DataTypes.STRING(6),
      allowNull: false,
      defaultValue: () => generateInviteCode(),
      unique: true,
    },
    maxMembers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
      validate: { min: 2, max: 100 },
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'book_clubs',
    timestamps: true,
    indexes: [
      { fields: ['created_by'] },
      { fields: ['invite_code'], unique: true },
      { fields: ['current_book_id'] },
    ],
  }
);

// ---------------------------------------------------------------------------
// BookClubMember
// ---------------------------------------------------------------------------

export type ClubRole = 'admin' | 'moderator' | 'member';

interface BookClubMemberAttributes {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  joinedAt: Date;
}

interface BookClubMemberCreationAttributes extends Optional<BookClubMemberAttributes, 'id' | 'role' | 'joinedAt'> {}

export class BookClubMember extends Model<BookClubMemberAttributes, BookClubMemberCreationAttributes> implements BookClubMemberAttributes {
  public id!: string;
  public clubId!: string;
  public userId!: string;
  public role!: ClubRole;
  public joinedAt!: Date;
}

BookClubMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'book_clubs', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'member',
      validate: { isIn: [['admin', 'moderator', 'member']] },
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'book_club_members',
    timestamps: false,
    indexes: [
      { fields: ['club_id'] },
      { fields: ['user_id'] },
      { fields: ['club_id', 'user_id'], unique: true },
    ],
  }
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

BookClub.hasMany(BookClubMember, { foreignKey: 'clubId', as: 'members' });
BookClubMember.belongsTo(BookClub, { foreignKey: 'clubId', as: 'club' });

BookClub.belongsTo(BookClubMember, { foreignKey: 'createdBy', as: 'creator', targetKey: 'userId', constraints: false });
