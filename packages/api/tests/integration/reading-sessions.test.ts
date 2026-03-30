/**
 * Reading Sessions API Integration Tests
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
  },
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

import readingSessionsRoutes from '../../src/routes/reading-sessions.routes';
import { generateToken } from '../../src/utils/auth';
import { ReadingSession, Book } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/reading-sessions', readingSessionsRoutes);

describe('Reading Sessions API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('POST /api/reading-sessions/start', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/reading-sessions/start')
        .send({ bookId: 'book-1' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a session', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue({
        id: 'book-1',
        userId: testUserId,
        title: 'Test Book',
        status: 'unread',
      });
      (ReadingSession.update as jest.Mock).mockResolvedValue([0]);
      (ReadingSession.create as jest.Mock).mockResolvedValue({
        id: 'session-1',
        userId: testUserId,
        bookId: 'book-1',
        startedAt: new Date(),
        isActive: true,
        pagesRead: 0,
        duration: 0,
      });
      (Book.update as jest.Mock).mockResolvedValue([1]);

      const response = await request(app)
        .post('/api/reading-sessions/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(ReadingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          bookId: 'book-1',
          isActive: true,
        })
      );
    });

    it('should return 404 for non-existent book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/reading-sessions/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'nonexistent' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  describe('POST /api/reading-sessions/:id/end', () => {
    it('should end an active session', async () => {
      const mockSession = {
        id: 'session-1',
        userId: testUserId,
        bookId: 'book-1',
        startedAt: new Date(Date.now() - 300000), // 5 minutes ago
        isActive: true,
        pagesRead: 0,
        update: jest.fn().mockResolvedValue(undefined),
      };
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/reading-sessions/session-1/end')
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          pagesRead: 10,
        })
      );
    });

    it('should return 404 for non-existent session', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/reading-sessions/nonexistent/end')
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 10 })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('PATCH /api/reading-sessions/:id/heartbeat', () => {
    it('should update active session', async () => {
      const mockSession = {
        id: 'session-1',
        userId: testUserId,
        bookId: 'book-1',
        startedAt: new Date(Date.now() - 120000), // 2 minutes ago
        isActive: true,
        pagesRead: 5,
        update: jest.fn().mockResolvedValue(undefined),
      };
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .patch('/api/reading-sessions/session-1/heartbeat')
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 8 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pagesRead).toBe(8);
      expect(mockSession.update).toHaveBeenCalled();
    });
  });

  describe('GET /api/reading-sessions', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reading-sessions')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should list user sessions with pagination', async () => {
      const mockSessions = [
        { id: 's1', userId: testUserId, bookId: 'b1', pagesRead: 10, duration: 300 },
        { id: 's2', userId: testUserId, bookId: 'b2', pagesRead: 5, duration: 150 },
      ];
      (ReadingSession.findAll as jest.Mock).mockResolvedValue(mockSessions);
      (ReadingSession.count as jest.Mock).mockResolvedValue(2);

      const response = await request(app)
        .get('/api/reading-sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });
  });
});
