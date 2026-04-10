/**
 * Settings API Integration Tests — Extended
 *
 * Supplements the existing settings.test.ts with additional coverage:
 * reading goals endpoint, partial updates, font family validation,
 * daily reading minutes, and notifications toggle.
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
    query: jest.fn().mockResolvedValue([]),
  },
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

import settingsRoutes from '../../src/routes/settings.routes';
import { generateToken } from '../../src/utils/auth';
import { User, Book, ReadingSession } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

describe('Settings API — Extended', () => {
  const testUserId = 'test-user-789';
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
    mockAuthUser();
  });

  // ---------------------------------------------------------------------------
  // GET /api/settings — additional cases
  // ---------------------------------------------------------------------------
  describe('GET /api/settings — additional cases', () => {
    it('should handle null settings gracefully', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: testUserId, settings: null });

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.theme).toBe('system');
      expect(response.body.data.fontSize).toBe(16);
      expect(response.body.data.readingGoal).toBe(2);
    });

    it('should preserve all user-customized fields', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({
          id: testUserId,
          settings: {
            theme: 'dark',
            fontSize: 20,
            fontFamily: 'Georgia',
            readingGoal: 5,
            dailyReadingMinutes: 60,
            notificationsEnabled: false,
            friendPersona: 'alex',
            friendFrequency: 'minimal',
          },
        });

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.theme).toBe('dark');
      expect(response.body.data.fontSize).toBe(20);
      expect(response.body.data.fontFamily).toBe('Georgia');
      expect(response.body.data.readingGoal).toBe(5);
      expect(response.body.data.dailyReadingMinutes).toBe(60);
      expect(response.body.data.notificationsEnabled).toBe(false);
      expect(response.body.data.friendPersona).toBe('alex');
      expect(response.body.data.friendFrequency).toBe('minimal');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/settings — additional validation cases
  // ---------------------------------------------------------------------------
  describe('PATCH /api/settings — additional cases', () => {
    const baseUser = {
      id: testUserId,
      settings: { theme: 'system', fontSize: 16 },
      update: jest.fn().mockResolvedValue(true),
    };

    it('should update a single field without affecting others', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontFamily: 'Merriweather' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.fontFamily).toBe('Merriweather');
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ fontFamily: 'Merriweather' }),
        })
      );
    });

    it('should update notificationsEnabled', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ notificationsEnabled: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notificationsEnabled).toBe(false);
    });

    it('should accept dailyReadingMinutes in request body', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ dailyReadingMinutes: 45 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should update readingGoal', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ readingGoal: 7 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.readingGoal).toBe(7);
    });

    it('should update friend frequency to frequent', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendFrequency: 'frequent' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.friendFrequency).toBe('frequent');
    });

    it('should reject fontSize below minimum (12)', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 8 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FONT_SIZE');
    });

    it('should reject fontSize above maximum (32)', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 50 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FONT_SIZE');
    });

    it('should reject fontSize that is not a number', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 'big' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FONT_SIZE');
    });

    it('should accept all valid themes', async () => {
      for (const theme of ['light', 'dark', 'system']) {
        const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
        (User.findByPk as jest.Mock)
          .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
          .mockResolvedValueOnce(mockUser);

        const response = await request(app)
          .patch('/api/settings')
          .set('Authorization', `Bearer ${token}`)
          .send({ theme })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.theme).toBe(theme);
      }
    });

    it('should accept all valid personas', async () => {
      for (const persona of ['sage', 'penny', 'alex', 'quinn', 'sam']) {
        const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
        (User.findByPk as jest.Mock)
          .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
          .mockResolvedValueOnce(mockUser);

        const response = await request(app)
          .patch('/api/settings')
          .set('Authorization', `Bearer ${token}`)
          .send({ friendPersona: persona })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.friendPersona).toBe(persona);
      }
    });

    it('should accept all valid frequencies', async () => {
      for (const freq of ['minimal', 'normal', 'frequent']) {
        const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
        (User.findByPk as jest.Mock)
          .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
          .mockResolvedValueOnce(mockUser);

        const response = await request(app)
          .patch('/api/settings')
          .set('Authorization', `Bearer ${token}`)
          .send({ friendFrequency: freq })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.friendFrequency).toBe(freq);
      }
    });

    it('should ignore unknown fields in the request body', async () => {
      const mockUser = { ...baseUser, update: jest.fn().mockResolvedValue(true) };
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark', unknownField: 'value', isAdmin: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.theme).toBe('dark');
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.not.objectContaining({
          unknownField: expect.anything(),
        })
      );
    });

    it('should return 404 when user not found on update', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce(null);

      const response = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/settings/reading-goals
  // ---------------------------------------------------------------------------
  describe('GET /api/settings/reading-goals', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/settings/reading-goals')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return reading goal progress with default goals', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: testUserId, settings: {} });
      (Book.count as jest.Mock).mockResolvedValueOnce(1); // completedThisWeek
      (Book.count as jest.Mock).mockResolvedValueOnce(3); // booksInProgress

      const response = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goal).toBe(2); // default
      expect(response.body.data.completed).toBe(1);
      expect(response.body.data.inProgress).toBe(3);
      expect(response.body.data.onTrack).toBe(false); // 1 < 2
      expect(response.body.data.remaining).toBe(1); // max(0, 2-1)
    });

    it('should report onTrack true when goal is met', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: testUserId, settings: { readingGoal: 1 } });
      (Book.count as jest.Mock).mockResolvedValueOnce(2);
      (Book.count as jest.Mock).mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goal).toBe(1);
      expect(response.body.data.completed).toBe(2);
      expect(response.body.data.onTrack).toBe(true); // 2 >= 1
      expect(response.body.data.remaining).toBe(0); // max(0, 1-2)
    });

    it('should handle zero books gracefully', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: testUserId, settings: { readingGoal: 3 } });
      (Book.count as jest.Mock).mockResolvedValueOnce(0);
      (Book.count as jest.Mock).mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.completed).toBe(0);
      expect(response.body.data.inProgress).toBe(0);
      expect(response.body.data.onTrack).toBe(false); // 0 < 3
      expect(response.body.data.remaining).toBe(3);
    });

    it('should use custom readingGoal from user settings', async () => {
      (User.findByPk as jest.Mock)
        .mockResolvedValueOnce({ id: testUserId, email: 'test@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: testUserId, settings: { readingGoal: 5 } });
      (Book.count as jest.Mock).mockResolvedValueOnce(3);
      (Book.count as jest.Mock).mockResolvedValueOnce(2);

      const response = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goal).toBe(5);
    });
  });
});
