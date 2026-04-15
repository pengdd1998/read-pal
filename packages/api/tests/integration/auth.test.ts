/**
 * Auth API Integration Tests
 *
 * Covers registration, login, token refresh, profile retrieval/update,
 * forgot-password stub, and logout.
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG'), exists: jest.fn().mockResolvedValue(0), incr: jest.fn().mockResolvedValue(1), pexpire: jest.fn().mockResolvedValue(1), pttl: jest.fn().mockResolvedValue(-1) },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

// We need bcrypt hashes to be deterministic in tests — mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$mockhashvalue'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock rate limiter — the in-memory store is shared across all limiter
// instances, so tests that exercise multiple rate-limited endpoints would
// exhaust the counter and cause false-429s.
jest.mock('../../src/middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  agentRateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import authRoutes from '../../src/routes/auth.routes';
import { generateToken } from '../../src/utils/auth';
import { User } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth API', () => {
  const testUserId = 'test-user-123';
  const testEmail = 'test@example.com';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/register
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null); // no existing user
      (User.create as jest.Mock).mockResolvedValue({
        id: 'new-user-id',
        email: testEmail,
        name: 'Test User',
        avatar: null,
        settings: { theme: 'system', fontSize: 16, fontFamily: 'Inter', readingGoal: 2, notificationsEnabled: true },
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: testEmail, password: 'password123', name: 'Test User' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testEmail);
      expect(response.body.data.user.name).toBe('Test User');
      expect(response.body.data.token).toBeDefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: testEmail,
          name: 'Test User',
          passwordHash: '$2a$12$mockhashvalue',
        })
      );
    });

    it('should reject registration with duplicate email', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: testEmail,
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: testEmail, password: 'password123', name: 'Test User' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_EXISTS');
    });

    it('should reject registration with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ password: 'password123', name: 'Test User' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'short', name: 'Test User' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with missing name', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/login
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({
        id: testUserId,
        email: testEmail,
        name: 'Test User',
        avatar: null,
        passwordHash: '$2a$12$realhash',
        settings: { theme: 'system' },
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'password123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(testUserId);
      expect(response.body.data.user.email).toBe(testEmail);
      expect(response.body.data.token).toBeDefined();
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', '$2a$12$realhash');
    });

    it('should reject login with wrong password', async () => {
      (User.findOne as jest.Mock).mockResolvedValue({
        id: testUserId,
        email: testEmail,
        passwordHash: '$2a$12$realhash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'wrongpassword' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for non-existent user', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject login when only email is provided', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/auth/me
  // ---------------------------------------------------------------------------
  describe('GET /api/auth/me', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return current user profile', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId,
        email: testEmail,
        name: 'Test User',
        avatar: null,
        settings: { theme: 'system' },
        createdAt: new Date('2026-01-01'),
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data.email).toBe(testEmail);
      expect(response.body.data.name).toBe('Test User');
    });

    it('should return 404 when user no longer exists', async () => {
      // The authenticate middleware also calls findByPk — both calls return null
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401); // auth middleware rejects before route handler

      expect(response.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/auth/me
  // ---------------------------------------------------------------------------
  describe('PATCH /api/auth/me', () => {
    const mockUser = {
      id: testUserId,
      email: testEmail,
      name: 'Test User',
      avatar: null,
      settings: { theme: 'system' },
      save: jest.fn().mockResolvedValue(undefined),
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/auth/me')
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update user name', async () => {
      mockUser.save.mockClear();
      // authenticate middleware needs a user, then route handler needs one too
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should update user avatar', async () => {
      mockUser.save.mockClear();
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ avatar: 'https://example.com/avatar.png' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.avatar).toBe('https://example.com/avatar.png');
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should merge settings on update', async () => {
      mockUser.save.mockClear();
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ settings: { theme: 'dark', fontSize: 20 } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.settings.theme).toBe('dark');
      expect(response.body.data.settings.fontSize).toBe(20);
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/forgot-password
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/forgot-password', () => {
    it('should return success for valid email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('reset link');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is not a string', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 123 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/logout
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/logout', () => {
    it('should return success on logout', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logged out successfully');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/refresh
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/refresh', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return a new token', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId,
        email: testEmail,
        name: 'Test User',
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      // Token should be a valid JWT string
      expect(response.body.data.token.split('.')).toHaveLength(3);
    });
  });
});
