/**
 * Migration Runner
 *
 * Simple migration system using a `schema_migrations` table to track
 * which migrations have been applied. Uses Sequelize QueryInterface
 * for DDL operations.
 */

import { sequelize } from '../db';
import { DataTypes, QueryInterface } from 'sequelize';

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[migrate] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[migrate] ${msg}`, ...args),
};

interface Migration {
  id: string;
  up: (qi: QueryInterface) => Promise<void>;
  down: (qi: QueryInterface) => Promise<void>;
}

// Registry of all migrations in order
const migrationRegistry: Migration[] = [];

/**
 * Ensure the schema_migrations table exists
 */
async function ensureMigrationTable(qi: QueryInterface): Promise<void> {
  const [results] = await qi.sequelize.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'schema_migrations'
    )`
  );

  const exists = (results as any[])[0]?.exists;
  if (!exists) {
    await qi.createTable('schema_migrations', {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      applied_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
    });
    logger.info('Created schema_migrations table');
  }
}

/**
 * Get list of already-applied migration IDs
 */
async function getAppliedMigrations(qi: QueryInterface): Promise<string[]> {
  const [results] = await qi.sequelize.query(
    'SELECT id FROM schema_migrations ORDER BY id'
  );
  return (results as any[]).map((r: any) => r.id);
}

/**
 * Register a migration
 */
export function registerMigration(migration: Migration): void {
  migrationRegistry.push(migration);
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  const qi = sequelize.getQueryInterface();

  await ensureMigrationTable(qi);
  const applied = new Set(await getAppliedMigrations(qi));

  const pending = migrationRegistry.filter(m => !applied.has(m.id));

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }

  logger.info(`Running ${pending.length} pending migration(s)...`);

  for (const migration of pending) {
    const startTime = Date.now();
    try {
      logger.info(`Running migration: ${migration.id}`);
      await migration.up(qi);

      // Record successful migration
      await qi.sequelize.query(
        `INSERT INTO schema_migrations (id, applied_at) VALUES ('${migration.id}', NOW())`
      );

      const duration = Date.now() - startTime;
      logger.info(`Migration ${migration.id} completed in ${duration}ms`);
    } catch (error: any) {
      logger.error(`Migration ${migration.id} failed: ${error.message}`);
      throw error;
    }
  }

  logger.info(`All ${pending.length} migration(s) completed successfully`);
}

/**
 * Rollback the most recent migration
 */
export async function rollbackMigration(): Promise<void> {
  const qi = sequelize.getQueryInterface();

  await ensureMigrationTable(qi);
  const applied = await getAppliedMigrations(qi);

  if (applied.length === 0) {
    logger.info('No migrations to rollback');
    return;
  }

  const lastApplied = applied[applied.length - 1];
  const migration = migrationRegistry.find(m => m.id === lastApplied);

  if (!migration) {
    throw new Error(`Migration ${lastApplied} not found in registry`);
  }

  logger.info(`Rolling back migration: ${migration.id}`);
  await migration.down(qi);

  await qi.sequelize.query(
    `DELETE FROM schema_migrations WHERE id = '${migration.id}'`
  );

  logger.info(`Migration ${migration.id} rolled back successfully`);
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  applied: string[];
  pending: string[];
}> {
  const qi = sequelize.getQueryInterface();
  await ensureMigrationTable(qi);

  const applied = await getAppliedMigrations(qi);
  const appliedSet = new Set(applied);
  const pending = migrationRegistry
    .filter(m => !appliedSet.has(m.id))
    .map(m => m.id);

  return { applied, pending };
}
