/**
 * Friend API Integration Tests
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
  redisClient: { ping: jest.fn().mockResolvedValue('PONG') },
  neo4jDriver: null,
  getPinecone: jest.fn().mockReturnValue(null),
}));

import friendRoutes from '../../src/routes/friend.routes';
import { generateToken } from '../../src/utils/auth';

const mockFriendAgent = {
  chat: jest.fn().mockResolvedValue({
    response: 'Hello! How can I help with your reading?',
    persona: 'sage',
    emotion: 'friendly',
  }),
  react: jest.fn().mockResolvedValue({
    response: 'That is a fascinating passage!',
    persona: 'sage',
    emotion: 'curious',
  }),
  getUserPersona: jest.fn().mockReturnValue('sage'),
  getPersonaDefinition: jest.fn().mockReturnValue({
    name: 'Sage',
    description: 'A wise and thoughtful companion',
    tone: 'reflective',
  }),
  getHistory: jest.fn().mockReturnValue([]),
  getAllPersonas: jest.fn().mockReturnValue(['sage', 'penny', 'alex', 'quinn', 'sam']),
  setPersona: jest.fn(),
};

const app = express();
app.use(express.json());
app.set('friendAgent', mockFriendAgent);
app.use('/api/friend', friendRoutes);

describe('Friend API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('GET /api/friend', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/friend')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return friend status', async () => {
      const response = await request(app)
        .get('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.persona).toBe('sage');
      expect(response.body.data.personaDetails).toBeDefined();
      expect(response.body.data.personaDetails.name).toBe('Sage');
      expect(response.body.data.historyLength).toBe(0);
      expect(response.body.data.allPersonas).toEqual(['sage', 'penny', 'alex', 'quinn', 'sam']);
    });

    it('should return 503 when friendAgent is not available', async () => {
      const noAgentApp = express();
      noAgentApp.use(express.json());
      // Do NOT set friendAgent on this app
      noAgentApp.use('/api/friend', friendRoutes);

      const response = await request(noAgentApp)
        .get('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('POST /api/friend/chat', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/friend/chat')
        .send({ message: 'Hello' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should send message and get response', async () => {
      const response = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'What do you think of this chapter?' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.response).toBe('Hello! How can I help with your reading?');
      expect(response.body.data.persona).toBe('sage');
      expect(mockFriendAgent.chat).toHaveBeenCalledWith(
        testUserId,
        'What do you think of this chapter?',
        undefined,
      );
    });

    it('should return 400 when message is missing', async () => {
      const response = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 400 when message is too long', async () => {
      const response = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'x'.repeat(5001) })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should accept context with the message', async () => {
      const context = {
        bookId: 'book-1',
        bookTitle: 'Test Book',
        currentPage: 42,
      };

      const response = await request(app)
        .post('/api/friend/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Explain this', context })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFriendAgent.chat).toHaveBeenCalledWith(
        testUserId,
        'Explain this',
        context,
      );
    });
  });

  describe('POST /api/friend/react', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/friend/react')
        .send({ text: 'Some passage' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should get a reaction for a passage', async () => {
      const response = await request(app)
        .post('/api/friend/react')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'A fascinating passage from the book.' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.response).toBe('That is a fascinating passage!');
      expect(mockFriendAgent.react).toHaveBeenCalledWith(
        testUserId,
        'A fascinating passage from the book.',
        undefined,
      );
    });

    it('should return 400 when text is missing', async () => {
      const response = await request(app)
        .post('/api/friend/react')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 400 when text is too long', async () => {
      const response = await request(app)
        .post('/api/friend/react')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'x'.repeat(10001) })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('PATCH /api/friend', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/friend')
        .send({ persona: 'penny' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update friend preferences', async () => {
      const response = await request(app)
        .patch('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .send({ persona: 'penny' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(mockFriendAgent.setPersona).toHaveBeenCalledWith(testUserId, 'penny');
    });

    it('should return 400 for invalid persona', async () => {
      const response = await request(app)
        .patch('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .send({ persona: 'invalid_persona' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return current persona without changes when no persona provided', async () => {
      const response = await request(app)
        .patch('/api/friend')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.persona).toBe('sage');
      expect(mockFriendAgent.setPersona).not.toHaveBeenCalled();
    });
  });
});
