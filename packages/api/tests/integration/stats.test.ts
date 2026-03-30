/**
 * Stats API Integration Tests
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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

import statsRoutes from '../../src/routes/stats.routes';
import { generateToken } from '../../src/utils/auth';
import { Book, Annotation, ReadingSession } from '../../src/models';
import { sequelize } from '../../src/db';

const app = express();
app.use(express.json());
app.use('/api/stats', statsRoutes);

describe('Stats API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('GET /api/stats/dashboard', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/stats/dashboard')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return dashboard stats with correct shape', async () => {
      // Mock Book.count for totalBooks and completedBooks
      (Book.count as jest.Mock)
        .mockResolvedValueOnce(10)  // totalBooks
        .mockResolvedValueOnce(3);  // completedBooks

      // Mock ReadingSession.sum for pagesRead and totalMinutesResult
      (ReadingSession.sum as jest.Mock)
        .mockResolvedValueOnce(250)    // pagesRead
        .mockResolvedValueOnce(7200);  // totalMinutesResult (in seconds)

      // Mock Annotation.count for highlightCount and connectionCount
      (Annotation.count as jest.Mock)
        .mockResolvedValueOnce(15)  // highlightCount
        .mockResolvedValueOnce(8);  // connectionCount

      // Mock Book.findAll for recentBooks
      (Book.findAll as jest.Mock)
        .mockResolvedValueOnce([    // recentBooks
          {
            id: 'b1',
            title: 'Recent Book',
            author: 'Author',
            progress: 75,
            lastReadAt: new Date(),
            coverUrl: null,
          },
        ])
        .mockResolvedValueOnce([    // booksByStatus
          { status: 'unread', count: '5' },
          { status: 'reading', count: '2' },
          { status: 'completed', count: '3' },
        ]);

      // Mock ReadingSession.findAll for streak calculation
      (ReadingSession.findAll as jest.Mock).mockResolvedValue([]);

      // Mock sequelize.query for weeklyActivity
      (sequelize.query as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stats/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Verify stats shape
      const { stats, recentBooks, weeklyActivity, booksByStatus } = response.body.data;
      expect(stats).toBeDefined();
      expect(stats.booksRead).toBe(3);
      expect(stats.totalPages).toBe(10);
      expect(stats.pagesRead).toBe(250);
      expect(stats.readingStreak).toBe(0);
      expect(stats.conceptsLearned).toBe(15);
      expect(stats.connections).toBe(8);
      expect(typeof stats.totalTime).toBe('string');

      // Verify recentBooks
      expect(Array.isArray(recentBooks)).toBe(true);
      expect(recentBooks).toHaveLength(1);
      expect(recentBooks[0].id).toBe('b1');
      expect(recentBooks[0].title).toBe('Recent Book');

      // Verify weeklyActivity
      expect(Array.isArray(weeklyActivity)).toBe(true);
      expect(weeklyActivity).toHaveLength(7);
      weeklyActivity.forEach((day: any) => {
        expect(day).toHaveProperty('day');
        expect(day).toHaveProperty('pages');
        expect(day).toHaveProperty('minutes');
      });

      // Verify booksByStatus
      expect(booksByStatus).toBeDefined();
      expect(booksByStatus.unread).toBe(5);
      expect(booksByStatus.reading).toBe(2);
      expect(booksByStatus.completed).toBe(3);
    });
  });
});
