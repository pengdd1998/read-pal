/**
 * Books API Integration Tests
 */

import request from 'supertest';
import app from '../src/index';
import { User, Book } from '../src/models';
import { generateToken } from '../src/utils/auth';

describe('Books API', () => {
  let user: any;
  let token: string;

  beforeEach(async () => {
    // Create test user
    user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
    });
    token = generateToken(user.id);
  });

  describe('POST /api/books', () => {
    it('should create a new book', async () => {
      const bookData = {
        title: 'Test Book',
        author: 'Test Author',
        fileType: 'epub',
        fileSize: 1024000,
      };

      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send(bookData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(bookData.title);
      expect(response.body.data.author).toBe(bookData.author);
      expect(response.body.data.userId).toBe(user.id);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/books')
        .send({
          title: 'Test Book',
          author: 'Test Author',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/books', () => {
    beforeEach(async () => {
      // Create test books
      await Book.create({
        userId: user.id,
        title: 'Book 1',
        author: 'Author 1',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      await Book.create({
        userId: user.id,
        title: 'Book 2',
        author: 'Author 2',
        fileType: 'pdf',
        fileSize: 2048000,
        totalPages: 200,
      });
    });

    it('should get all user books', async () => {
      const response = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should not return books from other users', async () => {
      // Create another user
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
      });

      // Create book for other user
      await Book.create({
        userId: otherUser.id,
        title: 'Other Book',
        author: 'Other Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      const response = await request(app)
        .get('/api/books')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should only return original user's books
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((b: any) => b.userId === user.id)).toBe(true);
    });
  });

  describe('GET /api/books/:id', () => {
    it('should get a specific book', async () => {
      const book = await Book.create({
        userId: user.id,
        title: 'Test Book',
        author: 'Test Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      const response = await request(app)
        .get(`/api/books/${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(book.id);
    });

    it('should not return books from other users', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
      });

      const book = await Book.create({
        userId: otherUser.id,
        title: 'Other Book',
        author: 'Other Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      const response = await request(app)
        .get(`/api/books/${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/books/:id', () => {
    it('should update book progress', async () => {
      const book = await Book.create({
        userId: user.id,
        title: 'Test Book',
        author: 'Test Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      const response = await request(app)
        .patch(`/api/books/${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPage: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.currentPage).toBe(50);
      expect(response.body.data.progress).toBe(50);
    });

    it('should update book status', async () => {
      const book = await Book.create({
        userId: user.id,
        title: 'Test Book',
        author: 'Test Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      const response = await request(app)
        .patch(`/api/books/${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'reading' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('reading');
      expect(response.body.data.startedAt).toBeTruthy();
    });
  });

  describe('DELETE /api/books/:id', () => {
    it('should delete a book', async () => {
      const book = await Book.create({
        userId: user.id,
        title: 'Test Book',
        author: 'Test Author',
        fileType: 'epub',
        fileSize: 1024000,
        totalPages: 100,
      });

      await request(app)
        .delete(`/api/books/${book.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const deleted = await Book.findByPk(book.id);
      expect(deleted).toBeNull();
    });
  });
});
