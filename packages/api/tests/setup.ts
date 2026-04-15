/**
 * Test Setup
 *
 * Mocks external services (DB, Redis, Neo4j, Pinecone) so unit tests
 * run without requiring live infrastructure.
 */

// Set required environment variables before any module loads
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing';

// Mock Sequelize
jest.mock('../src/db', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    truncate: jest.fn().mockResolvedValue(undefined),
    define: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    getQueryInterface: jest.fn().mockReturnValue({
      createTable: jest.fn(),
      dropTable: jest.fn(),
    }),
  },
  redisClient: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    quit: jest.fn().mockResolvedValue('OK'),
  },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

// Mock models index (which re-exports from db)
jest.mock('../src/models', () => {
  const { DataTypes } = require('sequelize');
  const sequelize = require('../src/db').sequelize;

  const createMockModel = (name: string) => {
    const model: any = {
      name,
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findByPk: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue([1]),
      destroy: jest.fn().mockResolvedValue(1),
      count: jest.fn().mockResolvedValue(0),
      sum: jest.fn().mockResolvedValue(0),
      bulkCreate: jest.fn().mockResolvedValue([]),
      init: jest.fn(),
    };
    return model;
  };

  return {
    sequelize: require('../src/db').sequelize,
    User: createMockModel('User'),
    Book: createMockModel('Book'),
    Annotation: createMockModel('Annotation'),
    Document: createMockModel('Document'),
    ReadingSession: createMockModel('ReadingSession'),
    MemoryBook: createMockModel('MemoryBook'),
  };
});

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test AI response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  })),
}));
