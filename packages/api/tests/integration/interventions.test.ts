/**
 * Interventions API Integration Tests
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
  Book: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findByPk: jest.fn() },
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

import interventionsRoutes from '../../src/routes/interventions.routes';
import { generateToken } from '../../src/utils/auth';
import { ReadingSession, Book, User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/interventions', interventionsRoutes);

describe('Interventions API', () => {
  const testUserId = 'test-user-123';
  const testBookId = 'book-456';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: 'test@test.com', name: 'Test User', settings: {},
    });
  });

  describe('POST /api/interventions/check', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/interventions/check')
        .send({ bookId: testBookId, currentPage: 10, totalPages: 100 })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return null intervention for normal reading', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);
      (Book.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/interventions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: testBookId,
          currentPage: 10,
          totalPages: 100,
          wordsPerMinute: 250,
          highlightCount: 3,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should detect confusion (reReadCount >= 3)', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);
      (Book.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/interventions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: testBookId,
          currentPage: 10,
          totalPages: 100,
          reReadCount: 4,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toBeNull();
      expect(response.body.data.type).toBe('confusion_detected');
    });

    it('should detect milestone (progress >= 100)', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);
      (Book.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/interventions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: testBookId,
          currentPage: 100,
          totalPages: 100,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toBeNull();
      expect(response.body.data.type).toBe('celebration');
      expect(response.body.data.trigger).toBe('book_completed');
    });

    it('should detect milestone (progress >= 50)', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);
      (Book.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/interventions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: testBookId,
          currentPage: 50,
          totalPages: 100,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).not.toBeNull();
      expect(response.body.data.trigger).toBe('halfway_mark');
    });
  });

  describe('POST /api/interventions/feedback', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/interventions/feedback')
        .send({ interventionType: 'confusion_detected', helpful: true })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should accept feedback', async () => {
      const response = await request(app)
        .post('/api/interventions/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ interventionType: 'confusion_detected', helpful: true, dismissed: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.received).toBe(true);
    });
  });
});
