/**
 * Migration Index
 *
 * Imports and registers all migrations in order.
 * Add new migrations here as they are created.
 */

import { registerMigration, runMigrations, rollbackMigration, getMigrationStatus } from './runner';

// Import migration definitions
import * as m001 from './001_initial_schema';
import * as m002 from './002_performance_indexes';
import * as m003 from './003_missing_tables';
import * as m004 from './004_personal_book_columns';
import * as m005 from './005_google_oauth';

// Register migrations in order
registerMigration({
  id: '001_initial_schema',
  up: m001.up,
  down: m001.down,
});

registerMigration({
  id: '002_performance_indexes',
  up: m002.up,
  down: m002.down,
});

registerMigration({
  id: '003_missing_tables',
  up: m003.up,
  down: m003.down,
});

registerMigration({
  id: '004_personal_book_columns',
  up: m004.up,
  down: m004.down,
});

registerMigration({
  id: '005_google_oauth',
  up: m005.up,
  down: m005.down,
});

// Re-export migration functions
export { runMigrations, rollbackMigration, getMigrationStatus };
