/**
 * Settings Persistence Integration Test
 *
 * Tests the full settings lifecycle:
 *   get default settings → update theme → update font → update goal →
 *   update persona → update frequency → re-fetch → verify all saved →
 *   validation: reject bad theme/font/persona → reading goals progress
 *
 * All calls go through real Express routes with mocked DB.
 */

import request from 'supertest';
import express from 'express';

process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';

// ---- Mocks ----

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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

// ---- Imports (after mocks) ----

import settingsRoutes from '../../src/routes/settings.routes';
import { generateToken } from '../../src/utils/auth';
import { User, Book, ReadingSession } from '../../src/models';

// ---- App Setup ----

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

// ---- Test Suite ----

describe('Settings Persistence Integration', () => {
  const testUserId = 'settings-user-001';
  let token: string;

  // Shared mutable user state to simulate real persistence across requests
  let userSettings: Record<string, any>;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    userSettings = {}; // Reset to empty (defaults will be applied)
  });

  // Helper to create a mock user that tracks settings updates
  function mockUserWithSettings(initialSettings: Record<string, any> = {}) {
    userSettings = { ...initialSettings };
    const mockUser = {
      id: testUserId,
      settings: userSettings,
      update: jest.fn().mockImplementation((data: any) => {
        if (data.settings) {
          userSettings = { ...userSettings, ...data.settings };
          mockUser.settings = userSettings;
        }
        return Promise.resolve(true);
      }),
    };
    (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
    return mockUser;
  }

  // ---------------------------------------------------------------
  // Step 1: Get default settings
  // ---------------------------------------------------------------
  describe('Step 1: Get default settings', () => {
    it('should return defaults for a new user', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('system');
      expect(res.body.data.fontSize).toBe(16);
      expect(res.body.data.fontFamily).toBe('Inter');
      expect(res.body.data.readingGoal).toBe(2);
      expect(res.body.data.notificationsEnabled).toBe(true);
      expect(res.body.data.friendPersona).toBe('sage');
      expect(res.body.data.friendFrequency).toBe('normal');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/settings')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Step 2: Update theme
  // ---------------------------------------------------------------
  describe('Step 2: Update theme', () => {
    it('should switch to dark theme', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'dark' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('dark');
    });

    it('should switch to light theme', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'light' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('light');
    });

    it('should reject invalid theme', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'neon' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_THEME');
    });
  });

  // ---------------------------------------------------------------
  // Step 3: Update font size
  // ---------------------------------------------------------------
  describe('Step 3: Update font size', () => {
    it('should change font size to 20', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 20 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.fontSize).toBe(20);
    });

    it('should reject font size below 12', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 10 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FONT_SIZE');
    });

    it('should reject font size above 32', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 40 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FONT_SIZE');
    });
  });

  // ---------------------------------------------------------------
  // Step 4: Update reading goal
  // ---------------------------------------------------------------
  describe('Step 4: Update reading goal', () => {
    it('should set reading goal to 3 books/week', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ readingGoal: 3 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.readingGoal).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // Step 5: Update friend persona and frequency
  // ---------------------------------------------------------------
  describe('Step 5: Update friend settings', () => {
    it('should switch to penny persona', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendPersona: 'penny' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.friendPersona).toBe('penny');
    });

    it('should switch to frequent friend messages', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendFrequency: 'frequent' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.friendFrequency).toBe('frequent');
    });

    it('should reject invalid persona', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendPersona: 'unknown_persona' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PERSONA');
    });

    it('should reject invalid frequency', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ friendFrequency: 'constantly' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_FREQUENCY');
    });
  });

  // ---------------------------------------------------------------
  // Step 6: Bulk update and verify persistence
  // ---------------------------------------------------------------
  describe('Step 6: Bulk update and verify persistence', () => {
    it('should apply multiple settings at once', async () => {
      mockUserWithSettings({});

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          theme: 'dark',
          fontSize: 22,
          fontFamily: 'Georgia',
          readingGoal: 5,
          friendPersona: 'alex',
          friendFrequency: 'minimal',
          notificationsEnabled: false,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('dark');
      expect(res.body.data.fontSize).toBe(22);
      expect(res.body.data.fontFamily).toBe('Georgia');
      expect(res.body.data.readingGoal).toBe(5);
      expect(res.body.data.friendPersona).toBe('alex');
      expect(res.body.data.friendFrequency).toBe('minimal');
      expect(res.body.data.notificationsEnabled).toBe(false);
    });

    it('should persist settings across GET requests', async () => {
      // Simulate: user has previously saved dark theme + large font + alex persona
      mockUserWithSettings({
        theme: 'dark',
        fontSize: 24,
        fontFamily: 'Georgia',
        readingGoal: 3,
        friendPersona: 'alex',
        friendFrequency: 'minimal',
        notificationsEnabled: false,
      });

      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('dark');
      expect(res.body.data.fontSize).toBe(24);
      expect(res.body.data.fontFamily).toBe('Georgia');
      expect(res.body.data.readingGoal).toBe(3);
      expect(res.body.data.friendPersona).toBe('alex');
      expect(res.body.data.friendFrequency).toBe('minimal');
      expect(res.body.data.notificationsEnabled).toBe(false);
    });

    it('should preserve existing settings when updating one field', async () => {
      // Start with full settings
      mockUserWithSettings({
        theme: 'dark',
        fontSize: 20,
        friendPersona: 'penny',
      });

      // Only update fontSize
      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ fontSize: 18 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.fontSize).toBe(18);
      // Existing settings should still be present
      expect(res.body.data.theme).toBe('dark');
      expect(res.body.data.friendPersona).toBe('penny');
    });
  });

  // ---------------------------------------------------------------
  // Step 7: Reading goals progress
  // ---------------------------------------------------------------
  describe('Step 7: Reading goals progress', () => {
    it('should return reading goal progress', async () => {
      mockUserWithSettings({ readingGoal: 2, dailyReadingMinutes: 30 });
      (Book.count as jest.Mock).mockResolvedValue(1); // 1 book completed this week
      (ReadingSession.sum as jest.Mock).mockResolvedValue(1800); // 30 min in seconds

      const res = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.goal).toBe(2);
      expect(res.body.data.completed).toBe(1);
      expect(res.body.data.remaining).toBe(1);
      expect(res.body.data.dailyGoalMinutes).toBe(30);
    });

    it('should show onTrack when goal is met', async () => {
      mockUserWithSettings({ readingGoal: 1 });
      (Book.count as jest.Mock).mockResolvedValue(2);
      (ReadingSession.sum as jest.Mock).mockResolvedValue(3600);

      const res = await request(app)
        .get('/api/settings/reading-goals')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.onTrack).toBe(true);
      expect(res.body.data.completed).toBeGreaterThanOrEqual(res.body.data.goal);
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe('Edge cases', () => {
    it('should return 401 for non-existent user (auth layer)', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should handle settings=null gracefully', async () => {
      mockUserWithSettings(null as any);
      // Override to simulate null settings
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId,
        settings: null,
      });

      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Should still get defaults
      expect(res.body.data.theme).toBe('system');
      expect(res.body.data.fontSize).toBe(16);
    });
  });
});
