/**
 * Books Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

/**
 * GET /api/books
 * Get all books for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const books = await Book.findAll({
      where: { userId: req.userId },
      order: [['addedAt', 'DESC']],
      limit,
      offset,
    });
    const total = await Book.count({ where: { userId: req.userId } });

    res.json({
      success: true,
      data: books,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOKS_FETCH_ERROR',
        message: 'Failed to fetch books',
      },
    });
  }
});

/**
 * GET /api/books/:id
 * Get a specific book
 */
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOK_NOT_FOUND',
          message: 'Book not found',
        },
      });
    }

    res.json({
      success: true,
      data: book,
    });
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOK_FETCH_ERROR',
        message: 'Failed to fetch book',
      },
    });
  }
});

/**
 * POST /api/books
 * Upload a new book
 */
router.post(
  '/',
  rateLimiter({ windowMs: 60000, max: 10 }),
  authenticate,
  validate([
    body('title').trim().isLength({ max: 200 }).withMessage('Title is required and must be at most 200 characters'),
    body('author').optional().trim().isLength({ max: 200 }).withMessage('Author must be at most 200 characters'),
    body('fileType').isIn(['epub', 'pdf']).withMessage('fileType must be epub or pdf'),
    body('fileSize').isInt({ min: 1 }).withMessage('fileSize must be a positive integer'),
  ]),
  async (req: AuthRequest, res) => {
  try {
    const { title, author, fileType, fileSize, coverUrl } = req.body;

    const book = await Book.create({
      userId: req.userId!,
      title,
      author,
      fileType,
      fileSize,
      coverUrl,
      totalPages: 0,
      currentPage: 0,
      progress: 0,
      addedAt: new Date(),
      status: 'unread',
    });

    res.status(201).json({
      success: true,
      data: book,
    });
  } catch (error) {
    console.error('Error creating book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOK_CREATE_ERROR',
        message: 'Failed to create book',
      },
    });
  }
});

/**
 * PATCH /api/books/:id
 * Update a book
 */
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOK_NOT_FOUND',
          message: 'Book not found',
        },
      });
    }

    const { currentPage, status } = req.body;

    if (currentPage !== undefined) {
      book.currentPage = currentPage;
      book.progress = (currentPage / book.totalPages) * 100;
      book.lastReadAt = new Date();
    }

    if (status !== undefined) {
      book.status = status;
      if (status === 'reading' && !book.startedAt) {
        book.startedAt = new Date();
      }
      if (status === 'completed' && !book.completedAt) {
        book.completedAt = new Date();
      }
    }

    await book.save();

    res.json({
      success: true,
      data: book,
    });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOK_UPDATE_ERROR',
        message: 'Failed to update book',
      },
    });
  }
});

/**
 * DELETE /api/books/:id
 * Delete a book
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOK_NOT_FOUND',
          message: 'Book not found',
        },
      });
    }

    await book.destroy();

    res.json({
      success: true,
      data: { id: book.id },
    });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOK_DELETE_ERROR',
        message: 'Failed to delete book',
      },
    });
  }
});

export default router;
