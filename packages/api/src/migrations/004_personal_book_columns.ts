/**
 * Migration 004: Personal Book Columns
 *
 * Adds `sections` (JSONB) and `html_content` (TEXT) columns to memory_books,
 * and expands the `format` enum to include 'personal_book'.
 */

import { QueryInterface, DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  // Add new columns
  await qi.addColumn('memory_books', 'sections', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  });

  await qi.addColumn('memory_books', 'html_content', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  // Expand format enum to include 'personal_book'
  // PostgreSQL requires altering the enum type
  await qi.sequelize.query(
    "ALTER TABLE memory_books ALTER COLUMN format TYPE VARCHAR(20)",
  );
  // Recreate the enum check constraint with the new value
  await qi.sequelize.query(
    "ALTER TABLE memory_books ADD CONSTRAINT memory_books_format_check CHECK (format IN ('scrapbook','journal','timeline','podcast','personal_book'))",
  );
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.removeColumn('memory_books', 'sections');
  await qi.removeColumn('memory_books', 'html_content');
  // Revert enum (remove personal_book from check)
  await qi.sequelize.query(
    "ALTER TABLE memory_books DROP CONSTRAINT IF EXISTS memory_books_format_check",
  );
  await qi.sequelize.query(
    "ALTER TABLE memory_books ADD CONSTRAINT memory_books_format_check CHECK (format IN ('scrapbook','journal','timeline','podcast'))",
  );
}
