/**
 * Annotations API Integration Tests
 */

import request from 'supertest';
import app from '../src/index';
import { User, Book, Annotation } from '../src/models';
import { generateToken } from '../src/utils/auth';

describe('Annotations API', () => {
  let user: any;
  let book: any;
  let token: string;

  beforeEach(async () => {
    user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
    });

    book = await Book.create({
      userId: user.id,
      title: 'Test Book',
      author: 'Test Author',
      fileType: 'epub',
      fileSize: 1024000,
      totalPages: 100,
    });

    token = generateToken(user.id);
  });

  describe('POST /api/annotations', () => {
    it('should create a highlight annotation', async () => {
      const annotationData = {
        bookId: book.id,
        type: 'highlight',
        content: 'This is important text',
        location: { pageIndex: 5, position: 100, selection: { start: 100, end: 125 } },
        color: '#FFEB3B',
      };

      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send(annotationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('highlight');
      expect(response.body.data.content).toBe(annotationData.content);
    });

    it('should create a note annotation', async () => {
      const annotationData = {
        bookId: book.id,
        type: 'note',
        content: 'This is important text',
        note: 'My thought about this',
        location: { pageIndex: 10, position: 200, selection: { start: 200, end: 225 } },
      };

      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send(annotationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('note');
      expect(response.body.data.note).toBe(annotationData.note);
    });

    it('should create a bookmark annotation', async () => {
      const annotationData = {
        bookId: book.id,
        type: 'bookmark',
        content: 'Bookmark page 15',
        location: { pageIndex: 15, position: 0, selection: { start: 0, end: 0 } },
      };

      const response = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .send(annotationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('bookmark');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/annotations')
        .send({
          bookId: book.id,
          type: 'highlight',
          content: 'Test',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/annotations', () => {
    beforeEach(async () => {
      // Create test annotations
      await Annotation.create({
        userId: user.id,
        bookId: book.id,
        type: 'highlight',
        content: 'Important text 1',
        location: { pageIndex: 1, position: 10, selection: { start: 10, end: 25 } },
      });

      await Annotation.create({
        userId: user.id,
        bookId: book.id,
        type: 'note',
        content: 'Important text 2',
        note: 'Note 2',
        location: { pageIndex: 2, position: 20, selection: { start: 20, end: 35 } },
      });
    });

    it('should get all user annotations', async () => {
      const response = await request(app)
        .get('/api/annotations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by bookId', async () => {
      const response = await request(app)
        .get(`/api/annotations?bookId=${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/annotations?type=highlight')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe('highlight');
    });
  });

  describe('PATCH /api/annotations/:id', () => {
    it('should update annotation content', async () => {
      const annotation = await Annotation.create({
        userId: user.id,
        bookId: book.id,
        type: 'highlight',
        content: 'Original text',
        location: { pageIndex: 1, position: 10, selection: { start: 10, end: 25 } },
      });

      const response = await request(app)
        .patch(`/api/annotations/${annotation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated text', color: '#FF9800' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('Updated text');
      expect(response.body.data.color).toBe('#FF9800');
    });

    it('should not update annotations from other users', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
      });

      const annotation = await Annotation.create({
        userId: otherUser.id,
        bookId: book.id,
        type: 'highlight',
        content: 'Other user annotation',
        location: { pageIndex: 1, position: 10, selection: { start: 10, end: 25 } },
      });

      const response = await request(app)
        .patch(`/api/annotations/${annotation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Trying to update' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/annotations/:id', () => {
    it('should delete an annotation', async () => {
      const annotation = await Annotation.create({
        userId: user.id,
        bookId: book.id,
        type: 'highlight',
        content: 'To be deleted',
        location: { pageIndex: 1, position: 10, selection: { start: 10, end: 25 } },
      });

      await request(app)
        .delete(`/api/annotations/${annotation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const deleted = await Annotation.findByPk(annotation.id);
      expect(deleted).toBeNull();
    });

    it('should not delete annotations from other users', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
      });

      const annotation = await Annotation.create({
        userId: otherUser.id,
        bookId: book.id,
        type: 'highlight',
        content: 'Other user annotation',
        location: { pageIndex: 1, position: 10, selection: { start: 10, end: 25 } },
      });

      const response = await request(app)
        .delete(`/api/annotations/${annotation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);

      // Verify annotation still exists
      const notDeleted = await Annotation.findByPk(annotation.id);
      expect(notDeleted).toBeTruthy();
    });
  });
});
