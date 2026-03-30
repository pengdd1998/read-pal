/**
 * Migration Index
 *
 * Imports and registers all migrations in order.
 * Add new migrations here as they are created.
 */

import { registerMigration, runMigrations, rollbackMigration, getMigrationStatus } from './runner';

// Import migration definitions
import * as m001 from './001_initial_schema';

// Register migrations in order
registerMigration({
  id: '001_initial_schema',
  up: m001.up,
  down: m001.down,
});

// Re-export migration functions
export { runMigrations, rollbackMigration, getMigrationStatus };
