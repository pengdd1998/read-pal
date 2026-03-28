/**
 * Test Setup
 */

import { sequelize } from '../src/models';

beforeAll(async () => {
  // Test database connection
  await sequelize.authenticate();
});

afterAll(async () => {
  // Close database connection
  await sequelize.close();
});

beforeEach(async () => {
  // Clean up database before each test
  await sequelize.truncate({ cascade: true });
});
