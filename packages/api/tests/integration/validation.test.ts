/**
 * Validation Middleware Integration Tests
 *
 * Tests that the validation middleware (express-validator) properly rejects
 * invalid input for routes that apply it.
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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG'), exists: jest.fn().mockResolvedValue(0), incr: jest.fn().mockResolvedValue(1), pexpire: jest.fn().mockResolvedValue(1), pttl: jest.fn().mockResolvedValue(-1) },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

jest.mock('../../src/middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: any, _res: any, next: any) => next(),
  agentRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

import booksRoutes from '../../src/routes/books.routes';
import annotationsRoutes from '../../src/routes/annotations.routes';
import agentRoutes from '../../src/routes/agent.routes';
import authRoutes from '../../src/routes/auth.routes';
import { generateToken } from '../../src/utils/auth';

const app = express();
app.use(express.json());
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/auth', authRoutes);

describe('Validation Middleware', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('POST /api/books validation', () => {
    it('should return 400 with VALIDATION_ERROR when title exceeds max length', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'x'.repeat(201), author: 'Author', fileType: 'epub', fileSize: 1024 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should return 400 when fileType is invalid', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test', fileType: 'docx', fileSize: 1024 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when fileSize is not a positive integer', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test', fileType: 'epub', fileSize: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/annotations validation', () => {
    it('should return 400 with VALIDATION_ERROR when bookId is missing', async () => {
      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'highlight', content: 'Some content' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should return 400 when type is invalid', async () => {
      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'b1', type: 'invalid', content: 'Some content' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/agents/chat validation', () => {
    it('should return 400 with INVALID_INPUT when message is missing', async () => {
      const response = await request(app)
        .post('/api/agents/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 400 when message exceeds max length', async () => {
      const response = await request(app)
        .post('/api/agents/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'x'.repeat(5001) })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/register validation', () => {
    it('should return 400 with VALIDATION_ERROR when email is invalid', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123', name: 'Test User' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when password is too short', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'short', name: 'Test User' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
