/**
 * Books API Integration Tests
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
  User: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Book: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  Annotation: { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), count: jest.fn() },
  ReadingSession: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), sum: jest.fn() },
  Document: {},
  MemoryBook: {},
  InterventionFeedback: {},
  FriendConversation: {},
  FriendRelationship: {},
  ChatMessage: { findAll: jest.fn().mockResolvedValue([]), bulkCreate: jest.fn().mockResolvedValue([]) },
  sequelize: { sync: jest.fn(), authenticate: jest.fn(), close: jest.fn(), query: jest.fn() },
}));

import booksRoutes from '../../src/routes/books.routes';
import { generateToken } from '../../src/utils/auth';
import { Book, User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/books', booksRoutes);

describe('Books API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: 'test@test.com', name: 'Test User', settings: {},
    });
  });

  describe('GET /api/books', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/books')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return user books', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'b1', title: 'Book 1', author: 'Author 1', progress: 50 },
        { id: 'b2', title: 'Book 2', author: 'Author 2', progress: 0 },
      ]);

      const response = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/books', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/books')
        .send({ title: 'Test' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a new book', async () => {
      (Book.create as jest.Mock).mockResolvedValue({
        id: 'new-book-id',
        title: 'New Book',
        author: 'Test Author',
        userId: testUserId,
        status: 'unread',
        progress: 0,
      });

      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Book', author: 'Test Author', fileType: 'epub', fileSize: 1024 })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(Book.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: testUserId, title: 'New Book' })
      );
    });
  });

  describe('GET /api/books/:id', () => {
    it('should return a specific book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue({
        id: 'book-1', title: 'Test Book', author: 'Author', userId: testUserId, progress: 50,
      });

      const response = await request(app)
        .get('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('book-1');
    });

    it('should return 404 for non-existent book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/books/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/books/:id', () => {
    it('should delete a book', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .delete('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockBook.destroy).toHaveBeenCalled();
    });
  });
});
