/**
 * Migration 007: Add summary column to reading_sessions
 *
 * Stores AI-generated reading session summaries.
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.addColumn('reading_sessions', 'summary', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  console.log('[migration:007] Added summary column to reading_sessions');
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.removeColumn('reading_sessions', 'summary');
  console.log('[migration:007] Removed summary column from reading_sessions');
}
