/**
 * Migration 005: Add Google OAuth support
 *
 * Adds google_id column to users table for OAuth login.
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // Add google_id column
  await qi.addColumn('users', 'google_id', {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  });

  // Add unique index
  await qi.addIndex('users', ['google_id'], {
    name: 'users_google_id_unique',
    unique: true,
    where: {
      google_id: { $ne: null },
    },
  });

  console.log('[migration:005] Added google_id column to users table');
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.removeIndex('users', 'users_google_id_unique');
  await qi.removeColumn('users', 'google_id');
  console.log('[migration:005] Removed google_id column from users table');
}
