/**
 * Friend Chat Flow Integration Test
 *
 * Tests the full friend/companion chat flow:
 *   get friend config → chat with friend → verify response →
 *   react to passage → update persona → verify new persona →
 *   check chat history (agent route) → stream chat
 *
 * All calls go through real Express routes with mocked DB, LLM, and friendAgent.
 */

import request from 'supertest';
import express from 'express';

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
    yield 'Great ';
    yield 'question! ';
    yield 'Let me think about that...';
  }),
  chatCompletion: jest.fn().mockResolvedValue('AI companion response'),
}));

jest.mock('../../src/services/llmClient', () => ({
  chatCompletionStream: jest.fn().mockImplementation(async function* () {
    yield 'Great ';
    yield 'question! ';
    yield 'Let me think about that...';
  }),
  chatCompletion: jest.fn().mockResolvedValue('AI companion response'),
}));

jest.mock('../../src/models/ChatMessage', () => ({
  ChatMessage: {
    findAll: jest.fn().mockResolvedValue([]),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/agents/orchestrator/AgentOrchestrator', () => ({
  AgentOrchestrator: jest.fn(),
}));

jest.mock('../../src/models/FriendConversation', () => ({
  FriendConversation: {
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    destroy: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/models', () => ({
  User: {
    findByPk: jest.fn().mockResolvedValue({
      id: 'friend-user-001',
      email: 'friend@test.com',
      name: 'Friend Tester',
      settings: { friendPersona: 'sage', friendFrequency: 'normal' },
      update: jest.fn().mockImplementation(function (this: any, data: any) {
        if (data.settings) {
          this.settings = { ...this.settings, ...data.settings };
        }
        return Promise.resolve(true);
      }),
    }),
  },
  Book: {},
  Annotation: {},
  ReadingSession: {},
  Document: {},
  MemoryBook: {},
  ChatMessage: {
    findAll: jest.fn().mockResolvedValue([]),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
  InterventionFeedback: {},
  FriendConversation: {
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    destroy: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
  },
  FriendRelationship: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      userId: 'friend-user-001', persona: 'sage', booksReadTogether: 0,
      sharedMoments: [], totalMessages: 0,
    }),
    upsert: jest.fn().mockResolvedValue([{}, true]),
  },
  sequelize: { sync: jest.fn(), authenticate: jest.fn(), close: jest.fn(), query: jest.fn() },
}));

// ---- Imports (after mocks) ----

import friendRoutes from '../../src/routes/friend.routes';
import agentRoutes from '../../src/routes/agent.routes';
import { generateToken } from '../../src/utils/auth';

// ---- App Setup ----

const mockFriendAgent = {
  chat: jest.fn().mockResolvedValue({
    response: 'That is a fascinating question! The concept relates to the fundamental nature of understanding.',
    persona: 'sage',
    emotion: 'thoughtful',
  }),
  react: jest.fn().mockResolvedValue({
    response: 'Beautifully written! This passage evokes a sense of wonder.',
    persona: 'sage',
    emotion: 'appreciative',
  }),
  getUserPersona: jest.fn().mockReturnValue('sage'),
  getPersonaDefinition: jest.fn().mockReturnValue({
    name: 'Sage',
    description: 'A wise and thoughtful companion',
    tone: 'reflective',
  }),
  getHistory: jest.fn().mockReturnValue([]),
  getAllPersonas: jest.fn().mockReturnValue([
    { id: 'sage', name: 'Sage', tone: 'wise' },
    { id: 'penny', name: 'Penny', tone: 'enthusiastic' },
    { id: 'alex', name: 'Alex', tone: 'analytical' },
    { id: 'quinn', name: 'Quinn', tone: 'calm' },
    { id: 'sam', name: 'Sam', tone: 'practical' },
  ]),
  setPersona: jest.fn(),
  clearHistory: jest.fn(),
};

const app = express();
app.use(express.json());
app.set('friendAgent', mockFriendAgent);

// Mock orchestrator for streaming endpoint
const mockOrchestrator = {
  process: jest.fn().mockResolvedValue({
    success: true,
    content: 'Sage says: What an insightful observation!',
    agentsUsed: [{ agentName: 'friend', duration: 200 }],
    metadata: { tokensUsed: 30 },
  }),
  getAgents: jest.fn().mockReturnValue([]),
};
app.set('orchestrator', mockOrchestrator);

app.use('/api/friend', friendRoutes);
app.use('/api/agents', agentRoutes);

// ---- Test Suite ----

describe('Friend Chat Flow Integration', () => {
  const testUserId = 'friend-user-001';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Step 1: Get initial friend config
  // ---------------------------------------------------------------
  describe('Step 1: Get friend configuration', () => {
    it('should return current friend persona and settings', async () => {
      const res = await request(app)
        .get('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.persona).toBe('sage');
      expect(res.body.data.personaDetails).toBeDefined();
      expect(res.body.data.personaDetails.name).toBe('Sage');
      expect(res.body.data.allPersonas).toHaveLength(5);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/friend')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Step 2: Chat with friend about a book passage
  // ---------------------------------------------------------------
  describe('Step 2: Chat with friend', () => {
    it('should send a message and receive a response', async () => {
      const res = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'What do you think about this chapter on memory?' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.response).toContain('fascinating question');
      expect(res.body.data.persona).toBe('sage');
      expect(res.body.data.emotion).toBe('thoughtful');
      expect(mockFriendAgent.chat).toHaveBeenCalledWith(
        testUserId,
        'What do you think about this chapter on memory?',
        undefined,
      );
    });

    it('should include reading context in chat', async () => {
      const context = {
        bookId: 'book-1',
        bookTitle: 'Thinking, Fast and Slow',
        author: 'Daniel Kahneman',
        currentPage: 5,
        totalPages: 30,
        chapterContent: 'System 1 operates automatically and quickly...',
      };

      const res = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Explain System 1 vs System 2', context })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockFriendAgent.chat).toHaveBeenCalledWith(
        testUserId,
        'Explain System 1 vs System 2',
        context,
      );
    });

    it('should reject empty messages', async () => {
      const res = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should reject messages over 5000 chars', async () => {
      const res = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'x'.repeat(5001) })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Step 3: React to a passage
  // ---------------------------------------------------------------
  describe('Step 3: React to a passage', () => {
    it('should get a reaction for a passage', async () => {
      const res = await request(app)
        .post('/api/friend/react')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'The only true wisdom is in knowing you know nothing.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.response).toContain('Beautifully written');
      expect(res.body.data.persona).toBe('sage');
      expect(mockFriendAgent.react).toHaveBeenCalledWith(
        testUserId,
        'The only true wisdom is in knowing you know nothing.',
        undefined,
      );
    });

    it('should react with book context', async () => {
      const context = { bookId: 'book-1', bookTitle: 'Meditations' };

      const res = await request(app)
        .post('/api/friend/react')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'A passage from the book', context })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockFriendAgent.react).toHaveBeenCalledWith(
        testUserId,
        'A passage from the book',
        context,
      );
    });
  });

  // ---------------------------------------------------------------
  // Step 4: Switch persona
  // ---------------------------------------------------------------
  describe('Step 4: Switch friend persona', () => {
    it('should switch from sage to penny', async () => {
      // Update the mock to return penny after switch
      mockFriendAgent.getUserPersona.mockReturnValue('penny');
      mockFriendAgent.getPersonaDefinition.mockReturnValue({
        name: 'Penny',
        description: 'An enthusiastic and joyful companion',
        tone: 'enthusiastic',
      });

      const res = await request(app)
        .patch('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .send({ persona: 'penny' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.persona).toBe('penny');
      expect(mockFriendAgent.setPersona).toHaveBeenCalledWith(testUserId, 'penny');
    });

    it('should reject invalid persona', async () => {
      const res = await request(app)
        .patch('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .send({ persona: 'robot' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  // ---------------------------------------------------------------
  // Step 5: Chat history (agent route)
  // ---------------------------------------------------------------
  describe('Step 5: Check chat history', () => {
    it('should get chat history for a book', async () => {
      // The agent route imports ChatMessage from '../models/ChatMessage' (direct file mock)
      const { ChatMessage: DirectChatMessage } = jest.requireMock('../../src/models/ChatMessage');
      DirectChatMessage.findAll.mockResolvedValueOnce([
        { id: 'msg-1', role: 'user', content: 'What is consciousness?', createdAt: new Date() },
        { id: 'msg-2', role: 'assistant', content: 'Consciousness is...', createdAt: new Date() },
      ]);

      const res = await request(app)
        .get('/api/agents/history')
        .query({ bookId: '550e8400-e29b-41d4-a716-446655440000' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].role).toBe('user');
      expect(res.body.data[1].role).toBe('assistant');
    });
  });

  // ---------------------------------------------------------------
  // Step 6: Streaming chat (SSE)
  // ---------------------------------------------------------------
  describe('Step 6: Stream chat with companion', () => {
    it('should stream an SSE response', async () => {
      const res = await request(app)
        .post('/api/agents/chat/stream')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Tell me more about this topic',
          context: { bookId: 'book-1', bookTitle: 'Test Book' },
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const text = res.text;
      expect(text).toContain('data: ');
      expect(text).toContain('[DONE]');
    });

    it('should reject streaming without auth', async () => {
      const res = await request(app)
        .post('/api/agents/chat/stream')
        .send({ message: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('should reject streaming without message', async () => {
      const res = await request(app)
        .post('/api/agents/chat/stream')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // Step 7: Service unavailable when friendAgent is missing
  // ---------------------------------------------------------------
  describe('Step 7: Graceful degradation', () => {
    it('should return 503 when friendAgent is not configured', async () => {
      const noAgentApp = express();
      noAgentApp.use(express.json());
      // Do NOT set friendAgent
      noAgentApp.use('/api/friend', friendRoutes);

      const res = await request(noAgentApp)
        .get('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .expect(503);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
