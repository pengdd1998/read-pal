/**
 * Reading Flow Integration Test
 *
 * Tests the full reading flow:
 *   register → login → create book → fetch content → start session →
 *   read chapter → add highlight → add note → add bookmark →
 *   list annotations → end session → verify progress updated
 *
 * All calls go through real Express routes with mocked DB and LLM.
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG'), exists: jest.fn().mockResolvedValue(0), incr: jest.fn().mockResolvedValue(1), pexpire: jest.fn().mockResolvedValue(1), pttl: jest.fn().mockResolvedValue(-1) },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

jest.mock('../../src/services/llmClient', () => ({
  chatCompletionStream: jest.fn().mockImplementation(async function* () {
    yield 'Hello ';
    yield 'from ';
    yield 'AI!';
  }),
  chatCompletion: jest.fn().mockResolvedValue('AI response'),
}));

jest.mock('../../src/models/ChatMessage', () => ({
  ChatMessage: {
    findAll: jest.fn().mockResolvedValue([]),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/models', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  Book: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  Annotation: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  ReadingSession: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    sum: jest.fn(),
  },
  ChatMessage: {
    findAll: jest.fn().mockResolvedValue([]),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
  Document: {},
  MemoryBook: {},
  InterventionFeedback: {},
  FriendConversation: {},
  FriendRelationship: {},
  sequelize: { sync: jest.fn(), authenticate: jest.fn(), close: jest.fn(), query: jest.fn() },
}));

// ---- Imports (after mocks) ----

import authRoutes from '../../src/routes/auth.routes';
import booksRoutes from '../../src/routes/books.routes';
import annotationsRoutes from '../../src/routes/annotations.routes';
import agentRoutes from '../../src/routes/agent.routes';
import readingSessionsRoutes from '../../src/routes/reading-sessions.routes';

import { generateToken } from '../../src/utils/auth';
import { User, Book, Annotation, ReadingSession, ChatMessage } from '../../src/models';

// ---- App Setup ----

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/reading-sessions', readingSessionsRoutes);

// Mock orchestrator on the app
const mockOrchestrator = {
  process: jest.fn().mockResolvedValue({
    success: true,
    content: 'This is an important passage about the nature of consciousness.',
    agentsUsed: [{ agentName: 'companion', duration: 150 }],
    metadata: { tokensUsed: 42 },
  }),
  getAgents: jest.fn().mockReturnValue([
    { name: 'companion', displayName: 'Reading Companion', purpose: 'Help readers', responsibilities: [] },
  ]),
};
app.set('orchestrator', mockOrchestrator);

// ---- Test Suite ----

describe('Reading Flow Integration — Full User Journey', () => {
  const testEmail = 'reader@test.com';
  const testPassword = 'password123';
  const testName = 'Test Reader';
  const testUserId = 'reader-user-001';
  let token: string;
  let bookId: string;
  let sessionId: string;
  let highlightId: string;
  let noteId: string;
  let bookmarkId: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
    // Auth middleware calls User.findByPk to verify user exists
    (User.findByPk as jest.Mock).mockResolvedValue({
      id: testUserId, email: testEmail, name: testName, settings: {},
    });
  });

  // ---------------------------------------------------------------
  // Step 1: Register → Login
  // ---------------------------------------------------------------
  describe('Step 1: Authentication', () => {
    it('should register a new user', async () => {
      const passwordHash = await bcrypt.hash(testPassword, 4);
      (User.findOne as jest.Mock).mockResolvedValue(null);
      (User.create as jest.Mock).mockResolvedValue({
        id: testUserId, email: testEmail, name: testName, passwordHash,
        settings: {},
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: testEmail, password: testPassword, name: testName })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should login and obtain auth token', async () => {
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
      token = res.body.data.token;
    });
  });

  // ---------------------------------------------------------------
  // Step 2: Create / Upload Book
  // ---------------------------------------------------------------
  describe('Step 2: Add book to library', () => {
    it('should create a new book', async () => {
      (Book.create as jest.Mock).mockResolvedValue({
        id: 'book-flow-1', userId: testUserId, title: 'Flow Test Book',
        author: 'Test Author', fileType: 'epub', fileSize: 2048,
        status: 'unread', progress: 0, totalPages: 10, currentPage: 0,
        tags: [],
      });

      const res = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Flow Test Book', author: 'Test Author', fileType: 'epub', fileSize: 2048 })
        .expect(201);

      expect(res.body.success).toBe(true);
      bookId = res.body.data.id;
      expect(bookId).toBeDefined();
    });

    it('should list the book in user library', async () => {
      (Book.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [
          { id: 'book-flow-1', title: 'Flow Test Book', author: 'Test Author',
            progress: 0, status: 'unread', totalPages: 10, currentPage: 0 },
        ],
        count: 1,
      });

      const res = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Flow Test Book');
    });
  });

  // ---------------------------------------------------------------
  // Step 3: Start reading session
  // ---------------------------------------------------------------
  describe('Step 3: Start reading session', () => {
    it('should start a reading session for the book', async () => {
      (Book.findOne as jest.Mock).mockResolvedValue({
        id: bookId, userId: testUserId, title: 'Flow Test Book', status: 'unread',
      });
      (ReadingSession.update as jest.Mock).mockResolvedValue([0]);
      (ReadingSession.create as jest.Mock).mockResolvedValue({
        id: 'session-flow-1', userId: testUserId, bookId,
        startedAt: new Date(), isActive: true, pagesRead: 0, duration: 0,
      });
      (Book.update as jest.Mock).mockResolvedValue([1]);

      const res = await request(app)
        .post('/api/reading-sessions/start')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId })
        .expect(201);

      expect(res.body.success).toBe(true);
      sessionId = res.body.data.id;
      expect(sessionId).toBe('session-flow-1');
    });
  });

  // ---------------------------------------------------------------
  // Step 4: Simulate reading — heartbeat with page progress
  // ---------------------------------------------------------------
  describe('Step 4: Read chapters (heartbeat)', () => {
    it('should send heartbeat updating page progress', async () => {
      const mockSession = {
        id: sessionId, userId: testUserId, bookId, isActive: true,
        startedAt: new Date(Date.now() - 60000), pagesRead: 0, duration: 0,
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return Promise.resolve(undefined);
        }),
      };
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(mockSession);

      const res = await request(app)
        .patch(`/api/reading-sessions/${sessionId}/heartbeat`)
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 3 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.pagesRead).toBe(3);
      expect(mockSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ pagesRead: 3 }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Step 5: Add annotations — highlight, note, bookmark
  // ---------------------------------------------------------------
  describe('Step 5: Annotate while reading', () => {
    it('should add a highlight', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-highlight-1', userId: testUserId, bookId,
        type: 'highlight', content: 'A profound insight about learning', color: '#FFEB3B',
        location: { chapterId: 'ch-1', pageIndex: 2, position: 0, selection: { start: 42, end: 78 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId, type: 'highlight', content: 'A profound insight about learning',
          color: '#FFEB3B',
          location: { chapterId: 'ch-1', pageIndex: 2, position: 0, selection: { start: 42, end: 78 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      highlightId = res.body.data.id;
      expect(Annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          type: 'highlight',
          content: 'A profound insight about learning',
        }),
      );
    });

    it('should add a note with thoughts', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-note-1', userId: testUserId, bookId,
        type: 'note', content: 'The author argues that...', note: 'This connects to the earlier chapter on memory.',
        location: { chapterId: 'ch-1', pageIndex: 2, position: 0, selection: { start: 100, end: 130 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId, type: 'note', content: 'The author argues that...',
          note: 'This connects to the earlier chapter on memory.',
          location: { chapterId: 'ch-1', pageIndex: 2, position: 0, selection: { start: 100, end: 130 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      noteId = res.body.data.id;
      expect(Annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          type: 'note',
          note: 'This connects to the earlier chapter on memory.',
        }),
      );
    });

    it('should add a bookmark', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-bookmark-1', userId: testUserId, bookId,
        type: 'bookmark', content: 'Bookmark: Chapter 3',
        location: { chapterId: 'ch-3', pageIndex: 2, position: 0, selection: { start: 0, end: 0 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId, type: 'bookmark', content: 'Bookmark: Chapter 3',
          location: { chapterId: 'ch-3', pageIndex: 2, position: 0, selection: { start: 0, end: 0 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      bookmarkId = res.body.data.id;
    });
  });

  // ---------------------------------------------------------------
  // Step 6: Verify all annotations are listed
  // ---------------------------------------------------------------
  describe('Step 6: Verify annotations', () => {
    it('should list all annotations for the book', async () => {
      (Annotation.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [
          { id: 'ann-highlight-1', type: 'highlight', content: 'A profound insight about learning', color: '#FFEB3B' },
          { id: 'ann-note-1', type: 'note', content: 'The author argues that...', note: 'This connects to the earlier chapter on memory.' },
          { id: 'ann-bookmark-1', type: 'bookmark', content: 'Bookmark: Chapter 3' },
        ],
        count: 3,
      });

      const res = await request(app)
        .get('/api/annotations')
        .query({ bookId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);

      const types = res.body.data.map((a: any) => a.type);
      expect(types).toContain('highlight');
      expect(types).toContain('note');
      expect(types).toContain('bookmark');
    });
  });

  // ---------------------------------------------------------------
  // Step 7: Chat with AI companion about the book
  // ---------------------------------------------------------------
  describe('Step 7: Chat with AI companion', () => {
    it('should ask the AI about a passage', async () => {

      const res = await request(app)
        .post('/api/agents/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'What does the author mean by consciousness?',
          context: { bookId, bookTitle: 'Flow Test Book', author: 'Test Author', currentPage: 2, totalPages: 10 },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.content).toBeDefined();
      expect(mockOrchestrator.process).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          query: expect.stringContaining('What does the author mean by consciousness?'),
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Step 8: End reading session — verify progress
  // ---------------------------------------------------------------
  describe('Step 8: End reading session', () => {
    it('should end the reading session and save progress', async () => {
      const mockSession = {
        id: sessionId, userId: testUserId, bookId,
        startedAt: new Date(Date.now() - 300000), // 5 minutes ago
        isActive: true, pagesRead: 0, duration: 0,
        update: jest.fn().mockResolvedValue(undefined),
      };
      (ReadingSession.findOne as jest.Mock).mockResolvedValue(mockSession);
      (Book.update as jest.Mock).mockResolvedValue([1]);

      const res = await request(app)
        .post(`/api/reading-sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ pagesRead: 5, currentPage: 4, totalPages: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          pagesRead: 5,
        }),
      );
    });

    it('should update book progress after reading', async () => {
      const mockBook = {
        id: bookId, userId: testUserId, currentPage: 0, progress: 0, totalPages: 10,
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Book.findOne as jest.Mock).mockResolvedValue(mockBook);

      const res = await request(app)
        .patch(`/api/books/${bookId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: 4, status: 'reading' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockBook.save).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Step 9: Cleanup — delete annotation
  // ---------------------------------------------------------------
  describe('Step 9: Cleanup', () => {
    it('should delete a highlight', async () => {
      const mockAnn = {
        id: 'ann-highlight-1', userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Annotation.findOne as jest.Mock).mockResolvedValue(mockAnn);

      const res = await request(app)
        .delete('/api/annotations/ann-highlight-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockAnn.destroy).toHaveBeenCalled();
    });
  });
});
