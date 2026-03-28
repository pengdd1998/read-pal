/**
 * Books Routes
 */

import { Router } from 'express';
import { Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/books
 * Get all books for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const books = await Book.findAll({
      where: { userId: req.userId },
      order: [['addedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: books,
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
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { title, author, fileType, fileSize, coverUrl } = req.body;

    const book = await Book.create({
      userId: req.userId!,
      title,
      author,
      fileType,
      fileSize,
      coverUrl,
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
