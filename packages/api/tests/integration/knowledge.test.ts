/**
 * Knowledge API Integration Tests
 */

import request from 'supertest';
import express from 'express';

jest.mock('../../src/middleware/middleware', () => ({
  initializeMiddleware: jest.fn(),
  errorHandler: (err: any, req: any, res: any, _next: any) => {
    res.status(500).json({ success: false, error: { message: err.message } });
  },
  notFoundHandler: (req: any, res: any) => {
    res.status(404).json({ success: false, error: { message: 'Not found' } });
  },
}));

jest.mock('../../src/db', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
    getQueryInterface: jest.fn().mockReturnValue({ createTable: jest.fn(), dropTable: jest.fn() }),
    query: jest.fn().mockResolvedValue([]),
  },
  redisClient: { ping: jest.fn().mockResolvedValue('PONG'), exists: jest.fn().mockResolvedValue(0), incr: jest.fn().mockResolvedValue(1), pexpire: jest.fn().mockResolvedValue(1), pttl: jest.fn().mockResolvedValue(-1) },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

jest.mock('../../src/models', () => ({
  User: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Book: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  Annotation: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn() },
  ReadingSession: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), sum: jest.fn() },
  Document: {},
  MemoryBook: {},
  InterventionFeedback: {},
  FriendConversation: {},
  FriendRelationship: {},
  ChatMessage: { findAll: jest.fn().mockResolvedValue([]), bulkCreate: jest.fn().mockResolvedValue([]) },
  sequelize: { sync: jest.fn(), authenticate: jest.fn(), close: jest.fn(), query: jest.fn() },
}));

import knowledgeRoutes from '../../src/routes/knowledge.routes';
import { generateToken } from '../../src/utils/auth';
import { User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/knowledge', knowledgeRoutes);

describe('Knowledge API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: 'test@test.com', name: 'Test User', settings: {},
    });
  });

  describe('GET /api/knowledge/graph', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/knowledge/graph')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty data when Neo4j is not configured', async () => {
      const response = await request(app)
        .get('/api/knowledge/graph')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.neo4jAvailable).toBe(false);
      expect(response.body.data.nodes).toEqual([]);
      expect(response.body.data.edges).toEqual([]);
    });
  });

  describe('GET /api/knowledge/concepts', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/knowledge/concepts')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty concepts when Neo4j is not configured', async () => {
      const response = await request(app)
        .get('/api/knowledge/concepts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.neo4jAvailable).toBe(false);
      expect(response.body.data.concepts).toEqual([]);
    });

    it('should accept bookId query parameter', async () => {
      const response = await request(app)
        .get('/api/knowledge/concepts?bookId=book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.neo4jAvailable).toBe(false);
    });
  });

  describe('GET /api/knowledge/themes', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/knowledge/themes')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty themes when Neo4j is not configured', async () => {
      const response = await request(app)
        .get('/api/knowledge/themes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.neo4jAvailable).toBe(false);
      expect(response.body.data.themes).toEqual([]);
    });
  });
});
