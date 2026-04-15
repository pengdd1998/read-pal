/**
 * Settings API Integration Tests
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

import settingsRoutes from '../../src/routes/settings.routes';
import { generateToken } from '../../src/utils/auth';
import { User, Book } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

describe('Settings API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return settings with defaults', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId,
        settings: {},
      });

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.theme).toBe('system');
      expect(response.body.data.fontSize).toBe(16);
      expect(response.body.data.fontFamily).toBe('Inter');
      expect(response.body.data.readingGoal).toBe(2);
      expect(response.body.data.notificationsEnabled).toBe(true);
      expect(response.body.data.friendPersona).toBe('sage');
      expect(response.body.data.friendFrequency).toBe('normal');
    });

    it('should return user settings merged with defaults', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId,
        settings: { theme: 'dark', fontSize: 20, friendPersona: 'penny' },
      });

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.theme).toBe('dark');
      expect(response.body.data.fontSize).toBe(20);
      expect(response.body.data.friendPersona).toBe('penny');
      // Defaults for non-overridden fields
      expect(response.body.data.fontFamily).toBe('Inter');
      expect(response.body.data.readingGoal).toBe(2);
    });

    it('should return 404 when user not found', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PATCH /api/settings', () => {
    const mockUser = {
      id: testUserId,
      settings: {},
      update: jest.fn().mockResolvedValue(true),
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({ theme: 'dark' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update settings', async () => {
      mockUser.settings = {};
      mockUser.update.mockImplementation((data: any) => {
        Object.assign(mockUser, data);
        return Promise.resolve(true);
      });
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark', fontSize: 18 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.theme).toBe('dark');
      expect(response.body.data.fontSize).toBe(18);
      expect(mockUser.update).toHaveBeenCalled();
    });

    it('should reject invalid theme', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'neon' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_THEME');
    });

    it('should reject invalid font size', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FONT_SIZE');
    });

    it('should reject invalid persona', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendPersona: 'unknown' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PERSONA');
    });

    it('should reject invalid frequency', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendFrequency: 'constantly' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FREQUENCY');
    });
  });
});
