/**
 * Test Setup
 *
 * Mocks external services (DB, Redis, Neo4j, Pinecone) so unit tests
 * run without requiring live infrastructure.
 */

// Set required environment variables before any module loads
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-min-32-chars-long';

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
    ApiKey: createMockModel('ApiKey'),
    Notification: createMockModel('Notification'),
    Webhook: createMockModel('Webhook'),
    WebhookDeliveryLog: createMockModel('WebhookDeliveryLog'),
    Flashcard: createMockModel('Flashcard'),
    Collection: createMockModel('Collection'),
    SharedExport: createMockModel('SharedExport'),
    ChatMessage: createMockModel('ChatMessage'),
    InterventionFeedback: createMockModel('InterventionFeedback'),
    FriendConversation: createMockModel('FriendConversation'),
    FriendRelationship: createMockModel('FriendRelationship'),
    BookClub: createMockModel('BookClub'),
    BookClubMember: createMockModel('BookClubMember'),
    ClubDiscussion: createMockModel('ClubDiscussion'),
  };
});

// Mock individual model files that are imported directly by services/routes
jest.mock('../src/models/ApiKey', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return {
    ApiKey: mockModel,
    generateApiKey: jest.fn().mockReturnValue({ key: 'test-key', keyHash: 'test-hash', keyPrefix: 'rp_' }),
    hashApiKey: jest.fn().mockReturnValue('test-hash'),
    isApiKeyFormat: jest.fn().mockReturnValue(false),
  };
});

jest.mock('../src/models/Notification', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([0]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return { Notification: mockModel };
});

jest.mock('../src/models/Webhook', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return {
    Webhook: mockModel,
    WebhookEvent: {} as any,
    isValidWebhookEvent: jest.fn().mockReturnValue(true),
    getValidWebhookEvents: jest.fn().mockReturnValue(['book.started', 'book.completed']),
  };
});

jest.mock('../src/models/WebhookDeliveryLog', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    init: jest.fn(),
  };
  return { WebhookDeliveryLog: mockModel };
});

// Mock OpenAI SDK (used by GLM via OpenAI-compatible API)
const MockOpenAI = jest.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Test AI response' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'glm-4.7-flash',
      }),
    },
  },
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: MockOpenAI,
}));

// Mock individual model files imported directly by routes/services
jest.mock('../src/models/Flashcard', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
    init: jest.fn(),
  };
  return {
    Flashcard: mockModel,
    calculateSM2: jest.fn().mockReturnValue({ interval: 1, easeFactor: 2.5, repetitions: 0 }),
  };
});

jest.mock('../src/models/FriendConversation', () => {
  const convMock: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  const relMock: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return { FriendConversation: convMock, FriendRelationship: relMock };
});

jest.mock('../src/models/ChatMessage', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    bulkCreate: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return { ChatMessage: mockModel };
});

jest.mock('../src/models/Book', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return { Book: mockModel };
});

jest.mock('../src/models/Annotation', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    init: jest.fn(),
  };
  return { Annotation: mockModel };
});

jest.mock('../src/models/ReadingSession', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return { ReadingSession: mockModel };
});

jest.mock('../src/models/InterventionFeedback', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return { InterventionFeedback: mockModel };
});

jest.mock('../src/models/User', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    init: jest.fn(),
  };
  return { User: mockModel };
});

jest.mock('../src/models/Document', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return { Document: mockModel };
});

jest.mock('../src/models/MemoryBook', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return { MemoryBook: mockModel };
});

jest.mock('../src/models/Collection', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  };
  return { Collection: mockModel };
});

jest.mock('../src/models/SharedExport', () => {
  const mockModel: any = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    init: jest.fn(),
  };
  return { SharedExport: mockModel };
});

jest.mock('../src/models/BookClub', () => {
  const createMock = () => ({
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    init: jest.fn(),
  });
  return {
    BookClub: createMock(),
    BookClubMember: createMock(),
    ClubDiscussion: createMock(),
  };
});
