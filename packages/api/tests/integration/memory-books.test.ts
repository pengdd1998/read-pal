/**
 * Memory Books API Integration Tests
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

jest.mock('../../src/services/MemoryBookService', () => ({
  memoryBookService: {
    listMemoryBooks: jest.fn().mockResolvedValue([]),
    getMemoryBook: jest.fn().mockResolvedValue(null),
    generate: jest.fn().mockResolvedValue({
      id: 'mb-1',
      userId: 'test-user-123',
      bookId: 'book-1',
      title: 'Memory Book: Test Book',
      format: 'scrapbook',
      moments: [],
      insights: [],
      stats: {
        pagesRead: 100,
        totalHighlights: 5,
        totalNotes: 3,
        readingDuration: 3600,
        conceptsDiscovered: 2,
        connectionsMade: 0,
      },
      generatedAt: new Date().toISOString(),
    }),
    deleteMemoryBook: jest.fn().mockResolvedValue(true),
  },
}));

import memoryBooksRoutes from '../../src/routes/memory-books.routes';
import { generateToken } from '../../src/utils/auth';
import { memoryBookService } from '../../src/services/MemoryBookService';
import { User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/memory-books', memoryBooksRoutes);

describe('Memory Books API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: 'test@test.com', name: 'Test User', settings: {},
    });
  });

  describe('GET /api/memory-books', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/memory-books')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return list of memory books', async () => {
      const mockBooks = [
        {
          id: 'mb-1',
          userId: testUserId,
          bookId: 'book-1',
          title: 'Memory Book: Test Book',
          format: 'scrapbook',
          generatedAt: new Date().toISOString(),
        },
      ];
      (memoryBookService.listMemoryBooks as jest.Mock).mockResolvedValueOnce(mockBooks);

      const response = await request(app)
        .get('/api/memory-books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('mb-1');
      expect(memoryBookService.listMemoryBooks).toHaveBeenCalledWith(testUserId);
    });

    it('should return empty list when no memory books exist', async () => {
      (memoryBookService.listMemoryBooks as jest.Mock).mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/memory-books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/memory-books/:bookId', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/memory-books/book-1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent memory book', async () => {
      (memoryBookService.getMemoryBook as jest.Mock).mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/memory-books/nonexistent-book')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MEMORY_BOOK_NOT_FOUND');
    });

    it('should return a specific memory book', async () => {
      const mockMemoryBook = {
        id: 'mb-1',
        userId: testUserId,
        bookId: 'book-1',
        title: 'Memory Book: Test Book',
        format: 'scrapbook',
        moments: [],
        insights: [],
        generatedAt: new Date().toISOString(),
      };
      (memoryBookService.getMemoryBook as jest.Mock).mockResolvedValueOnce(mockMemoryBook);

      const response = await request(app)
        .get('/api/memory-books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('mb-1');
      expect(memoryBookService.getMemoryBook).toHaveBeenCalledWith('book-1', testUserId);
    });
  });

  describe('POST /api/memory-books/:bookId/generate', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/memory-books/book-1/generate')
        .send({})
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should generate a memory book', async () => {
      const response = await request(app)
        .post('/api/memory-books/book-1/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ format: 'scrapbook' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.bookId).toBe('book-1');
      expect(memoryBookService.generate).toHaveBeenCalledWith(
        'book-1',
        testUserId,
        { format: 'scrapbook' },
      );
    });

    it('should return 404 when book is not found', async () => {
      (memoryBookService.generate as jest.Mock).mockRejectedValueOnce(
        new Error('Book not found'),
      );

      const response = await request(app)
        .post('/api/memory-books/nonexistent/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  describe('DELETE /api/memory-books/:bookId', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/memory-books/book-1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete a memory book', async () => {
      (memoryBookService.deleteMemoryBook as jest.Mock).mockResolvedValueOnce(true);

      const response = await request(app)
        .delete('/api/memory-books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.bookId).toBe('book-1');
    });

    it('should return 404 for non-existent memory book', async () => {
      (memoryBookService.deleteMemoryBook as jest.Mock).mockResolvedValueOnce(false);

      const response = await request(app)
        .delete('/api/memory-books/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MEMORY_BOOK_NOT_FOUND');
    });
  });
});
