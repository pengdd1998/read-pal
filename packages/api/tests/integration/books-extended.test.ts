/**
 * Books API Integration Tests — Extended
 *
 * Supplements the existing books.test.ts with additional coverage:
 * pagination, PATCH update with status changes and progress, and seed-sample.
 */

import request from 'supertest';
import express from 'express';

jest.mock('../../src/middleware/middleware', () => ({
  initializeMiddleware: jest.fn(),
  errorHandler: (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ success: false, error: { message: err.message } });
  },
  notFoundHandler: (_req: express.Request, res: express.Response) => {
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

// Mock rate limiter to avoid in-memory store leaking across tests
jest.mock('../../src/middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  agentRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import booksRoutes from '../../src/routes/books.routes';
import { generateToken } from '../../src/utils/auth';
import { User, Book, Document } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/books', booksRoutes);

describe('Books API — Extended', () => {
  const testUserId = 'test-user-456';
  let token: string;

  /** Mock the authenticate middleware's User.findByPk call. */
  const mockAuthUser = (): void => {
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId,
      email: 'test@example.com',
      name: 'Test User',
    });
  };

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    // By default, let authenticate succeed for all authenticated tests.
    // Individual tests override findByPk for route-handler specific behavior
    // by using Book.findOne / Book.findAll etc.
    mockAuthUser();
  });

  // ---------------------------------------------------------------------------
  // GET /api/books — pagination
  // ---------------------------------------------------------------------------
  describe('GET /api/books — pagination', () => {
    it('should return paginated results with defaults', async () => {
      const mockBooks = Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`,
        title: `Book ${i}`,
        author: `Author ${i}`,
        userId: testUserId,
        progress: 0,
        addedAt: new Date(),
      }));
      (Book.findAll as jest.Mock).mockResolvedValue(mockBooks);
      (Book.count as jest.Mock).mockResolvedValue(25);

      const response = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
      });
    });

    it('should respect page and limit query params', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([]);
      (Book.count as jest.Mock).mockResolvedValue(100);

      const response = await request(app)
        .get('/api/books?page=3&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 100,
        totalPages: 10,
      });

      // Verify findAll was called with the correct offset
      expect(Book.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20, // (page 3 - 1) * limit 10
        })
      );
    });

    it('should cap limit at 100', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([]);
      (Book.count as jest.Mock).mockResolvedValue(0);

      await request(app)
        .get('/api/books?limit=500')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Book.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/books/:id — error cases
  // ---------------------------------------------------------------------------
  describe('GET /api/books/:id — error cases', () => {
    it('should return 404 for book belonging to another user', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/books/other-user-book')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/books/:id
  // ---------------------------------------------------------------------------
  describe('PATCH /api/books/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/books/book-1')
        .send({ status: 'reading' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update book status to reading', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        status: 'unread',
        startedAt: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'reading' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockBook.status).toBe('reading');
      expect(mockBook.startedAt).toBeInstanceOf(Date);
      expect(mockBook.save).toHaveBeenCalled();
    });

    it('should update book status to completed', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        status: 'reading',
        startedAt: new Date('2026-03-01'),
        completedAt: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockBook.status).toBe('completed');
      expect(mockBook.completedAt).toBeInstanceOf(Date);
    });

    it('should reject invalid status value', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        status: 'unread',
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should update currentPage and recalculate progress', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        status: 'reading',
        currentPage: 0,
        totalPages: 100,
        progress: 0,
        lastReadAt: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockBook.currentPage).toBe(50);
      expect(mockBook.progress).toBe(50);
      expect(mockBook.lastReadAt).toBeInstanceOf(Date);
    });

    it('should cap progress at 100 when currentPage exceeds totalPages', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
        status: 'reading',
        currentPage: 0,
        totalPages: 100,
        progress: 0,
        lastReadAt: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: 200 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockBook.progress).toBe(100);
    });

    it('should reject negative currentPage', async () => {
      const mockBook = {
        id: 'book-1',
        userId: testUserId,
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: -5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when updating non-existent book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/books/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'reading' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOK_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/books — validation
  // ---------------------------------------------------------------------------
  describe('POST /api/books — validation', () => {
    it('should reject missing fileType', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', fileSize: 1024 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid fileType', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', fileType: 'docx', fileSize: 1024 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing fileSize', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', fileType: 'epub' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/books/:id — error cases
  // ---------------------------------------------------------------------------
  describe('DELETE /api/books/:id — error cases', () => {
    it('should return 404 for non-existent book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/books/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BOOK_NOT_FOUND');
    });

    it('should return the deleted book id', async () => {
      const mockBook = {
        id: 'book-to-delete',
        userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const response = await request(app)
        .delete('/api/books/book-to-delete')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('book-to-delete');
      expect(mockBook.destroy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/books/seed-sample
  // ---------------------------------------------------------------------------
  describe('POST /api/books/seed-sample', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/books/seed-sample')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a sample book when none exists', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue(null);
      (Book.create as jest.Mock).mockResolvedValue({
        id: 'sample-book-id',
        userId: testUserId,
        title: 'The Art of Reading (Sample)',
        author: 'read-pal',
        fileType: 'epub',
        totalPages: 3,
        status: 'unread',
        progress: 0,
      });
      (Document.create as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/books/seed-sample')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.book.title).toBe('The Art of Reading (Sample)');
      expect(Book.create).toHaveBeenCalled();
      expect(Document.create).toHaveBeenCalled();
    });

    it('should return existing sample book if already seeded', async () => {
      const existingBook = {
        id: 'existing-sample',
        title: 'The Art of Reading (Sample)',
        author: 'read-pal',
        fileType: 'epub',
        totalPages: 3,
        status: 'unread',
        progress: 0,
      };
      (Book.findOne as jest.Mock).mockResolvedValue(existingBook);

      const response = await request(app)
        .post('/api/books/seed-sample')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.book.id).toBe('existing-sample');
      expect(response.body.data.message).toContain('already exists');
      // Should NOT create a new book
      expect(Book.create).not.toHaveBeenCalled();
    });
  });
});
