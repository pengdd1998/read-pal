/**
 * Annotations API Integration Tests
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

import annotationsRoutes from '../../src/routes/annotations.routes';
import { generateToken } from '../../src/utils/auth';
import { Annotation } from '../../src/models';

const app = express();
app.use(express.json());
app.use('/api/annotations', annotationsRoutes);

describe('Annotations API', () => {
  const testUserId = 'test-user-123';
  let token: string;

  beforeEach(() => {
    token = generateToken(testUserId);
    jest.clearAllMocks();
  });

  describe('GET /api/annotations', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/annotations')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return user annotations', async () => {
      (Annotation.findAll as jest.Mock).mockResolvedValue([
        { id: 'a1', type: 'highlight', content: 'Text 1' },
        { id: 'a2', type: 'note', content: 'Text 2' },
      ]);

      const response = await request(app)
        .get('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('POST /api/annotations', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/annotations')
        .send({ bookId: 'b1', type: 'highlight', content: 'Test' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a highlight annotation', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-1', type: 'highlight', content: 'Important text', userId: testUserId,
      });

      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: 'book-1',
          type: 'highlight',
          content: 'Important text',
          location: { pageIndex: 5 },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(Annotation.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: testUserId, type: 'highlight' })
      );
    });

    it('should create a note annotation', async () => {
      (Annotation.create as jest.Mock).mockResolvedValue({
        id: 'ann-2', type: 'note', content: 'Text', note: 'Thought', userId: testUserId,
      });

      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookId: 'book-1',
          type: 'note',
          content: 'Important text',
          note: 'My thought',
          location: { pageIndex: 10 },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/annotations/:id', () => {
    it('should delete an annotation', async () => {
      const mockAnnotation = {
        id: 'ann-1',
        userId: testUserId,
        destroy: jest.fn().mockResolvedValue(undefined),
      };
      (Annotation.findOne as jest.Mock).mockResolvedValue(mockAnnotation);

      const response = await request(app)
        .delete('/api/annotations/ann-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent annotation', async () => {
      (Annotation.findOne as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/annotations/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
