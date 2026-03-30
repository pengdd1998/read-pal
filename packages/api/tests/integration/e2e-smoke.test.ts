/**
 * E2E Smoke Test
 *
 * Exercises the full user flow: register → login → create book → read →
 * annotate → chat with agent → check dashboard → settings → discovery.
 * All API calls are tested against the real Express app with mocked DB/Anthropic.
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

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

jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response from Claude' }],
        model: 'claude-3-5-sonnet',
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  })),
}));

// ---- Imports (after mocks) ----

import authRoutes from '../../src/routes/auth.routes';
import booksRoutes from '../../src/routes/books.routes';
import annotationsRoutes from '../../src/routes/annotations.routes';
import agentRoutes from '../../src/routes/agent.routes';
import statsRoutes from '../../src/routes/stats.routes';
import settingsRoutes from '../../src/routes/settings.routes';
import discoveryRoutes from '../../src/routes/discovery.routes';
import readingSessionsRoutes from '../../src/routes/reading-sessions.routes';
import interventionsRoutes from '../../src/routes/interventions.routes';
import friendRoutes from '../../src/routes/friend.routes';
import knowledgeRoutes from '../../src/routes/knowledge.routes';
import memoryBooksRoutes from '../../src/routes/memory-books.routes';

import { generateToken } from '../../src/utils/auth';
import { User, Book, Annotation, ReadingSession } from '../../src/models';

// ---- App Setup ----

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/reading-sessions', readingSessionsRoutes);
app.use('/api/interventions', interventionsRoutes);
app.use('/api/friend', friendRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/memory-books', memoryBooksRoutes);

// Mock friendAgent on the app (normally set by initializeAgents)
const mockFriendAgent = {
  chat: jest.fn().mockResolvedValue({ response: 'Hello friend!', persona: 'sage', emotion: 'warm' }),
  react: jest.fn().mockResolvedValue({ response: 'Interesting!', persona: 'sage', emotion: 'curious' }),
  getUserPersona: jest.fn().mockReturnValue('sage'),
  getPersonaDefinition: jest.fn().mockReturnValue({ name: 'Sage', tone: 'wise', description: 'Thoughtful guide' }),
  getHistory: jest.fn().mockReturnValue([]),
  getAllPersonas: jest.fn().mockReturnValue([
    { id: 'sage', name: 'Sage', tone: 'wise' },
    { id: 'penny', name: 'Penny', tone: 'enthusiastic' },
  ]),
  setPersona: jest.fn(),
};
app.set('friendAgent', mockFriendAgent);

// ---- Test Suite ----

describe('E2E Smoke Test — Full User Flow', () => {
  const testEmail = 'e2e@test.com';
  const testPassword = 'password123';
  const testName = 'E2E Tester';
  const testUserId = 'e2e-user-001';
  let token: string;
  let bookId: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // 1. AUTH — Register, Login, Me
  // ---------------------------------------------------------------
  describe('Auth flow', () => {
    it('should register a new user', async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      (User.findOne as jest.Mock).mockResolvedValue(null);
      (User.create as jest.Mock).mockResolvedValue({
        id: testUserId, email: testEmail, name: testName, passwordHash,
        avatar: null, settings: { theme: 'system', fontSize: 16 },
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: testEmail, password: testPassword, name: testName })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it('should login with correct credentials', async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      (User.findOne as jest.Mock).mockResolvedValue({
        id: testUserId, email: testEmail, name: testName, passwordHash,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      (User.findOne as jest.Mock).mockResolvedValue({
        id: testUserId, email: testEmail, name: testName, passwordHash,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'wrongpassword' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should get current user profile', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId, email: testEmail, name: testName,
        avatar: null, settings: {}, createdAt: new Date(),
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testEmail);
    });
  });

  // ---------------------------------------------------------------
  // 2. BOOKS — CRUD
  // ---------------------------------------------------------------
  describe('Book management', () => {
    it('should create a new book', async () => {
      (Book.create as jest.Mock).mockResolvedValue({
        id: 'book-1', userId: testUserId, title: 'Test Book', author: 'Author',
        fileType: 'epub', fileSize: 1024, status: 'unread', progress: 0, totalPages: 200,
      });

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', author: 'Author', fileType: 'epub', fileSize: 1024 })
        .expect(201);

      expect(res.body.success).toBe(true);
      bookId = res.body.data.id;
    });

    it('should list user books', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'book-1', title: 'Book 1', author: 'A1', progress: 50, status: 'reading' },
        { id: 'book-2', title: 'Book 2', author: 'A2', progress: 0, status: 'unread' },
      ]);

      const res = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should get a specific book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue({
        id: 'book-1', title: 'Test Book', userId: testUserId, progress: 50,
      });

      const res = await request(app)
        .get('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('book-1');
    });

    it('should update book progress', async () => {
      const mockBook = {
        id: 'book-1', userId: testUserId, currentPage: 0, progress: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const res = await request(app)
        .patch('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: 50, status: 'reading' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockBook.save).toHaveBeenCalled();
    });

    it('should delete a book', async () => {
      const mockBook = {
        id: 'book-1', userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const res = await request(app)
        .delete('/api/books/book-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockBook.destroy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 3. ANNOTATIONS — Highlight, Note, Bookmark
  // ---------------------------------------------------------------
  describe('Annotations', () => {
    it('should create a highlight', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-1', userId: testUserId, bookId: 'book-1', type: 'highlight',
        content: 'Important passage', color: '#FFEB3B',
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: 'book-1', type: 'highlight', content: 'Important passage',
          location: { pageIndex: 5, position: 100 }, color: '#FFEB3B',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(Annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: testUserId, type: 'highlight' })
      );
    });

    it('should list annotations by book', async () => {
      (Annotation.findAll as jest.Mock).mockResolvedValue([
        { id: 'a1', type: 'highlight', content: 'Text 1' },
        { id: 'a2', type: 'note', content: 'Text 2', note: 'My thought' },
      ]);

      const res = await request(app)
        .get('/api/annotations')
        .query({ bookId: 'book-1' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should delete an annotation', async () => {
      const mockAnn = {
        id: 'ann-1', userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Annotation.findOne as jest.Mock).mockResolvedValue(mockAnn);

      const res = await request(app)
        .delete('/api/annotations/ann-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockAnn.destroy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 4. READING SESSIONS
  // ---------------------------------------------------------------
  describe('Reading sessions', () => {
    it('should start a reading session', async () => {
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(null);
      (ReadingSession.create as jest.Mock).mockResolvedValue({
        id: 'session-1', userId: testUserId, bookId: 'book-1',
        startTime: new Date(), endTime: null, isActive: true,
      });

      const res = await request(app)
        .post('/api/reading-sessions/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should end a reading session', async () => {
      const mockSession = {
        id: 'session-1', userId: testUserId, bookId: 'book-1',
        startedAt: new Date(), endedAt: null, isActive: true, pagesRead: 0,
        duration: 0,
        update: jest.fn().mockResolvedValue(undefined),
      };
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(mockSession);
      (Book.update as jest.Mock).mockResolvedValue([1]);

      const res = await request(app)
        .post('/api/reading-sessions/session-1/end')
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockSession.update).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 5. SETTINGS
  // ---------------------------------------------------------------
  describe('User settings', () => {
    it('should get user settings', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId, settings: { theme: 'dark', fontSize: 18, fontFamily: 'serif',
          readingGoal: { booksPerWeek: 2 }, friendPersona: 'sage', friendFrequency: 'normal' },
      });

      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.theme).toBe('dark');
    });

    it('should update settings', async () => {
      const mockUser = {
        id: testUserId, settings: {},
        update: jest.fn().mockResolvedValue(undefined),
      };
      (User.findByPk as jest.Mock).mockResolvedValue(mockUser);

      const res = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ theme: 'light', fontSize: 20 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockUser.update).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 6. DISCOVERY — Search & Recommendations
  // ---------------------------------------------------------------
  describe('Book discovery', () => {
    it('should search user library', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([
        { id: 'b1', title: 'Thinking, Fast and Slow', author: 'Kahneman' },
      ]);

      const res = await request(app)
        .get('/api/discovery/search')
        .query({ q: 'thinking' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should list free books', async () => {
      const res = await request(app)
        .get('/api/discovery/free-books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------
  // 7. DASHBOARD STATS
  // ---------------------------------------------------------------
  describe('Dashboard stats', () => {
    it('should return dashboard data', async () => {
      // Stats route uses many Sequelize calls in parallel
      (Book.count as jest.Mock).mockResolvedValue(5);
      (Book.findAll as jest.Mock).mockResolvedValue([]);
      (ReadingSession.findAll as jest.Mock).mockResolvedValue([]);
      (ReadingSession.sum as jest.Mock).mockResolvedValue(0);
      (Annotation.count as jest.Mock).mockResolvedValue(0);

      // Mock sequelize.query for weekly activity raw SQL
      const { sequelize: mockSequelize } = jest.requireMock('../../src/models');
      mockSequelize.query = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get('/api/stats/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.stats).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // 8. INTERVENTIONS
  // ---------------------------------------------------------------
  describe('Interventions', () => {
    it('should check for interventions', async () => {
      const res = await request(app)
        .post('/api/interventions/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: 'book-1', currentPage: 5, totalPages: 200,
          readingSpeedWPM: 80, timeSinceLastInteraction: 600,
          reReadCount: 3, sessionDurationMinutes: 45,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should record intervention feedback', async () => {
      const res = await request(app)
        .post('/api/interventions/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ interventionId: 'int-1', helpful: true })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 9. FRIEND
  // ---------------------------------------------------------------
  describe('Reading Friend', () => {
    it('should chat with friend', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId, settings: { friendPersona: 'sage' },
      });

      const res = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'What do you think of this chapter?' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should get friend config', async () => {
      (User.findByPk as jest.Mock).mockResolvedValue({
        id: testUserId, settings: { friendPersona: 'sage', friendFrequency: 'normal' },
      });

      const res = await request(app)
        .get('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 10. KNOWLEDGE & MEMORY BOOKS
  // ---------------------------------------------------------------
  describe('Knowledge & Memory', () => {
    it('should get knowledge graph', async () => {
      const res = await request(app)
        .get('/api/knowledge/graph')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should get cross-book themes', async () => {
      const res = await request(app)
        .get('/api/knowledge/themes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should list memory books', async () => {
      (Book.findAll as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/memory-books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 11. AUTH GATE — Verify all protected endpoints reject unauthenticated requests
  // ---------------------------------------------------------------
  describe('Auth gate (unauthenticated access)', () => {
    const protectedEndpoints = [
      { method: 'get' as const, path: '/api/books' },
      { method: 'post' as const, path: '/api/books' },
      { method: 'get' as const, path: '/api/annotations' },
      { method: 'post' as const, path: '/api/annotations' },
      { method: 'get' as const, path: '/api/settings' },
      { method: 'get' as const, path: '/api/stats/dashboard' },
      { method: 'get' as const, path: '/api/discovery/search' },
      { method: 'get' as const, path: '/api/friend' },
      { method: 'get' as const, path: '/api/knowledge/graph' },
      { method: 'get' as const, path: '/api/memory-books' },
    ];

    it.each(protectedEndpoints)('should reject unauthenticated $method $path', async ({ method, path }) => {
      const res = await request(app)[method](path).expect(401);
      expect(res.body.success).toBe(false);
    });
  });
});
