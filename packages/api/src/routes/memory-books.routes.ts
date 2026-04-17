/**
 * Memory Books Routes
 *
 * Endpoints for generating, retrieving, listing, and deleting Memory Books.
 * All routes require authentication.
 */

import { Router } from 'express';
import { Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { memoryBookService } from '../services/MemoryBookService';
import { parsePagination } from '../utils/pagination';
import { notFound } from '../utils/errors';

const router: Router = Router();

/**
 * GET /api/memory-books
 * List all memory books for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req, 50);

    const { rows: memoryBooks, count: total } = await memoryBookService.listMemoryBooks(req.userId!, { limit, offset });

    res.json({
      success: true,
      data: memoryBooks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing memory books:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMORY_BOOKS_LIST_ERROR',
        message: 'Failed to list memory books',
      },
    });
  }
});

/**
 * GET /api/memory-books/:bookId
 * Get a specific memory book
 */
router.get('/:bookId', authenticate, async (req: AuthRequest, res) => {
  try {
    const memoryBook = await memoryBookService.getMemoryBook(
      req.params.bookId,
      req.userId!,
    );

    if (!memoryBook) {
      return notFound(res, 'Memory book');
    }

    res.json({
      success: true,
      data: memoryBook,
    });
  } catch (error) {
    console.error('Error fetching memory book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMORY_BOOK_FETCH_ERROR',
        message: 'Failed to fetch memory book',
      },
    });
  }
});

/**
 * GET /api/memory-books/:bookId/html
 * Get the rendered HTML for a Personal Reading Book
 */
router.get('/:bookId/html', authenticate, async (req: AuthRequest, res) => {
  try {
    const memoryBook = await memoryBookService.getMemoryBook(
      req.params.bookId,
      req.userId!,
    );

    if (!memoryBook || !memoryBook.htmlContent) {
      return notFound(res, 'Personal reading book');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(memoryBook.htmlContent);
  } catch (error) {
    console.error('Error fetching personal book HTML:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERSONAL_BOOK_HTML_ERROR',
        message: 'Failed to fetch personal book',
      },
    });
  }
});

/**
 * POST /api/memory-books/:bookId/generate
 * Trigger generation of a memory book for a specific book
 */
router.post('/:bookId/generate', rateLimiter({ windowMs: 300000, max: 3 }), authenticate, async (req: AuthRequest, res) => {
  try {
    const { format } = req.body ?? {};

    const memoryBook = await memoryBookService.generate(
      req.params.bookId,
      req.userId!,
      { format },
    );

    res.status(201).json({
      success: true,
      data: memoryBook,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Book not found') {
      return notFound(res, 'Book');
    }

    console.error('Error generating memory book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMORY_BOOK_GENERATION_ERROR',
        message: 'Failed to generate memory book',
      },
    });
  }
});

/**
 * DELETE /api/memory-books/:bookId
 * Delete a memory book
 */
router.delete('/:bookId', authenticate, async (req: AuthRequest, res) => {
  try {
    const deleted = await memoryBookService.deleteMemoryBook(
      req.params.bookId,
      req.userId!,
    );

    if (!deleted) {
      return notFound(res, 'Memory book');
    }

    res.json({
      success: true,
      data: { bookId: req.params.bookId },
    });
  } catch (error) {
    console.error('Error deleting memory book:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMORY_BOOK_DELETE_ERROR',
        message: 'Failed to delete memory book',
      },
    });
  }
});

export default router;
