/**
 * Discovery API Integration Tests
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

import discoveryRoutes from '../../src/routes/discovery.routes';
import { generateToken } from '../../src/utils/auth';
import { Book, User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/discovery', discoveryRoutes);

describe('Discovery API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: 'test@test.com', name: 'Test User', settings: {},
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/discovery/search
  // ---------------------------------------------------------------------------

  describe('GET /api/discovery/search', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/discovery/search')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should search by title', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'b1', title: 'Pride and Prejudice', author: 'Jane Austen', progress: 50 },
      ]);

      const response = await request(app)
        .get('/api/discovery/search?q=Pride')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(Book.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: testUserId }),
        })
      );
    });

    it('should search by author', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'b2', title: 'Great Expectations', author: 'Charles Dickens', progress: 0 },
      ]);

      const response = await request(app)
        .get('/api/discovery/search?q=Dickens')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'b3', title: 'Moby Dick', author: 'Herman Melville', status: 'completed', progress: 100 },
      ]);

      const response = await request(app)
        .get('/api/discovery/search?status=completed')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/discovery/recommendations
  // ---------------------------------------------------------------------------

  describe('GET /api/discovery/recommendations', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/discovery/recommendations')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return top authors', async () => {
      // First call: completed books
      // Second call: reading books
      (Book.findAll as jest.Mock)
        .mockResolvedValueOnce([
          { author: 'Jane Austen', title: 'Pride and Prejudice' },
          { author: 'Jane Austen', title: 'Emma' },
          { author: 'Charles Dickens', title: 'Great Expectations' },
        ])
        .mockResolvedValueOnce([
          { author: 'Jane Austen', title: 'Sense and Sensibility' },
        ])
        // Third call: recommendations query
        .mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/discovery/recommendations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.topAuthors).toContain('Jane Austen');
      expect(response.body.data.topAuthors).toContain('Charles Dickens');
      expect(response.body.data.stats.booksCompleted).toBe(3);
      expect(response.body.data.stats.booksReading).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/discovery/free-books
  // ---------------------------------------------------------------------------

  describe('GET /api/discovery/free-books', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/discovery/free-books')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return paginated list', async () => {
      const response = await request(app)
        .get('/api/discovery/free-books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.total).toBe(20);
      expect(response.body.pagination.totalPages).toBe(2);
    });

    it('should filter by query', async () => {
      const response = await request(app)
        .get('/api/discovery/free-books?query=Sherlock')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('The Adventures of Sherlock Holmes');
      expect(response.body.pagination.total).toBe(1);
    });
  });
});
