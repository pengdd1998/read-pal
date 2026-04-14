/**
 * Knowledge & Highlights Flow Integration Test
 *
 * Tests the full knowledge/annotation flow:
 *   create highlights across books → fetch by book → fetch by type →
 *   update annotation → delete annotation → knowledge graph →
 *   concepts → cross-book themes → export annotations
 *
 * All calls go through real Express routes with mocked DB and services.
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

jest.mock('../../src/services/KnowledgeGraph', () => ({
  KnowledgeGraphService: jest.fn().mockImplementation(() => ({
    getGraphVisualization: jest.fn().mockResolvedValue({
      nodes: [
        { id: 'n1', label: 'Consciousness', type: 'concept', bookIds: ['b1', 'b2'] },
        { id: 'n2', label: 'Memory', type: 'concept', bookIds: ['b1'] },
        { id: 'n3', label: 'Thinking, Fast and Slow', type: 'book' },
        { id: 'n4', label: 'Meditations', type: 'book' },
      ],
      edges: [
        { source: 'n1', target: 'n3', label: 'DISCUSSED_IN' },
        { source: 'n1', target: 'n4', label: 'DISCUSSED_IN' },
        { source: 'n2', target: 'n3', label: 'DISCUSSED_IN' },
        { source: 'n1', target: 'n2', label: 'RELATED_TO' },
      ],
    }),
    getConcepts: jest.fn().mockResolvedValue([
      { id: 'c1', name: 'Consciousness', description: 'The state of being aware', frequency: 5, bookIds: ['b1', 'b2'] },
      { id: 'c2', name: 'Memory', description: 'The process of encoding and recalling information', frequency: 3, bookIds: ['b1'] },
      { id: 'c3', name: 'Decision Making', description: 'The cognitive process of choosing a course of action', frequency: 7, bookIds: ['b1'] },
    ]),
    getCrossBookThemes: jest.fn().mockResolvedValue([
      { theme: 'The nature of human thought', books: ['Thinking, Fast and Slow', 'Meditations'], strength: 0.85, concepts: ['Consciousness', 'Memory'] },
      { theme: 'Self-improvement through reflection', books: ['Meditations', 'Atomic Habits'], strength: 0.72, concepts: ['Habits', 'Reflection'] },
    ]),
  })),
}));

jest.mock('../../src/models', () => ({
  User: {
    findByPk: jest.fn().mockResolvedValue({
      id: 'knowledge-user-001',
      email: 'knowledge@test.com',
      name: 'Knowledge Tester',
      settings: {},
    }),
  },
  Book: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  Annotation: {
    findOne: jest.fn(),
    findAll: jest.fn(),
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
  ChatMessage: {},
  Document: {},
  MemoryBook: {},
  InterventionFeedback: {},
  FriendConversation: {},
  FriendRelationship: {},
  sequelize: { sync: jest.fn(), authenticate: jest.fn(), close: jest.fn(), query: jest.fn() },
}));

// ---- Imports (after mocks) ----

import annotationsRoutes from '../../src/routes/annotations.routes';
import knowledgeRoutes from '../../src/routes/knowledge.routes';
import { generateToken } from '../../src/utils/auth';
import { Annotation, Book, User } from '../../src/models';

// ---- App Setup ----

const app = express();
app.use(express.json());
app.use('/api/annotations', annotationsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// ---- Test Suite ----

describe('Knowledge & Highlights Flow Integration', () => {
  const testUserId = 'knowledge-user-001';
  let token: string;
  const bookId1 = 'book-knowledge-1';
  const bookId2 = 'book-knowledge-2';

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Step 1: Create highlights across multiple books
  // ---------------------------------------------------------------
  describe('Step 1: Create highlights across books', () => {
    it('should create a highlight in book 1', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-k1', userId: testUserId, bookId: bookId1,
        type: 'highlight', content: 'System 1 operates automatically and quickly', color: '#FFEB3B',
        location: { chapterId: 'ch-1', pageIndex: 0, selection: { start: 0, end: 40 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: bookId1, type: 'highlight',
          content: 'System 1 operates automatically and quickly',
          color: '#FFEB3B',
          location: { chapterId: 'ch-1', pageIndex: 0, selection: { start: 0, end: 40 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should create a note in book 1', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-k2', userId: testUserId, bookId: bookId1,
        type: 'note', content: 'The author argues...', note: 'This connects to our earlier reading on cognitive biases.',
        location: { chapterId: 'ch-2', pageIndex: 1, selection: { start: 100, end: 130 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: bookId1, type: 'note',
          content: 'The author argues...',
          note: 'This connects to our earlier reading on cognitive biases.',
          location: { chapterId: 'ch-2', pageIndex: 1, selection: { start: 100, end: 130 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(Annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'note', note: expect.any(String) }),
      );
    });

    it('should create a highlight in book 2', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-k3', userId: testUserId, bookId: bookId2,
        type: 'highlight', content: 'The universe is change; our life is what our thoughts make it', color: '#90CAF9',
        location: { chapterId: 'ch-5', pageIndex: 4, selection: { start: 50, end: 100 } },
      });

      const res = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: bookId2, type: 'highlight',
          content: 'The universe is change; our life is what our thoughts make it',
          color: '#90CAF9',
          location: { chapterId: 'ch-5', pageIndex: 4, selection: { start: 50, end: 100 } },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Step 2: Fetch and filter annotations
  // ---------------------------------------------------------------
  describe('Step 2: Fetch annotations', () => {
    it('should list all annotations across books', async () => {
      (Annotation.findAll as jest.Mock).mockResolvedValue([
        { id: 'ann-k1', type: 'highlight', content: 'System 1...', bookId: bookId1, color: '#FFEB3B' },
        { id: 'ann-k2', type: 'note', content: 'The author argues...', bookId: bookId1, note: 'Connection...' },
        { id: 'ann-k3', type: 'highlight', content: 'The universe...', bookId: bookId2, color: '#90CAF9' },
      ]);

      const res = await request(app)
        .get('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it('should list annotations filtered by book', async () => {
      (Annotation.findAll as jest.Mock).mockResolvedValue([
        { id: 'ann-k1', type: 'highlight', content: 'System 1...', bookId: bookId1 },
        { id: 'ann-k2', type: 'note', content: 'The author argues...', bookId: bookId1 },
      ]);

      const res = await request(app)
        .get('/api/annotations')
        .query({ bookId: bookId1 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((a: any) => a.bookId === bookId1)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Step 3: Update annotation (edit note)
  // ---------------------------------------------------------------
  describe('Step 3: Update annotations', () => {
    it('should update a note annotation', async () => {
      const mockAnn = {
        id: 'ann-k2', userId: testUserId, type: 'note',
        content: 'The author argues...', note: 'Original note',
        save: jest.fn().mockResolvedValue(undefined),
      };
      (Annotation.findOne as jest.Mock).mockResolvedValue(mockAnn);

      const res = await request(app)
        .patch('/api/annotations/ann-k2')
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'Updated: this is actually about cognitive load theory' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Step 4: Knowledge graph — nodes and edges (graceful empty state when no Neo4j)
  // ---------------------------------------------------------------
  describe('Step 4: Knowledge graph', () => {
    it('should return graph data with neo4jAvailable flag', async () => {
      const res = await request(app)
        .get('/api/knowledge/graph')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      // When Neo4j is not configured (neo4jDriver: null), returns empty state
      expect(res.body.data.neo4jAvailable).toBe(false);
      expect(res.body.data.nodes).toBeDefined();
      expect(res.body.data.edges).toBeDefined();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/knowledge/graph')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Step 5: Concepts list (empty when no Neo4j)
  // ---------------------------------------------------------------
  describe('Step 5: Concepts', () => {
    it('should return concepts response', async () => {
      const res = await request(app)
        .get('/api/knowledge/concepts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.concepts).toBeDefined();
      // When Neo4j is not configured, returns empty array
      expect(res.body.data.neo4jAvailable).toBe(false);
    });

    it('should accept bookId filter', async () => {
      const res = await request(app)
        .get('/api/knowledge/concepts')
        .query({ bookId: bookId1 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Step 6: Cross-book themes (empty when no Neo4j)
  // ---------------------------------------------------------------
  describe('Step 6: Cross-book themes', () => {
    it('should return themes response', async () => {
      const res = await request(app)
        .get('/api/knowledge/themes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.themes).toBeDefined();
      // When Neo4j is not configured, returns empty array
      expect(res.body.data.neo4jAvailable).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Step 7: Delete annotation and verify removal
  // ---------------------------------------------------------------
  describe('Step 7: Delete annotation', () => {
    it('should delete a highlight', async () => {
      const mockAnn = {
        id: 'ann-k3', userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Annotation.findOne as jest.Mock).mockResolvedValue(mockAnn);

      const res = await request(app)
        .delete('/api/annotations/ann-k3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockAnn.destroy).toHaveBeenCalled();
    });

    it('should return 404 for non-existent annotation', async () => {
      (Annotation.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/annotations/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Graceful degradation verified above: all knowledge endpoints
  // return success with neo4jAvailable: false when Neo4j is not configured
  // ---------------------------------------------------------------
});
