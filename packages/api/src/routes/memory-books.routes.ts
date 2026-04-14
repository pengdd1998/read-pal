/**
 * Memory Books Routes
 *
 * Endpoints for generating, retrieving, listing, and deleting Memory Books.
 * All routes require authentication.
 */

import { Router } from 'express';
import { MemoryBook, Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { memoryBookService } from '../services/MemoryBookService';

const router: Router = Router();

/**
 * GET /api/memory-books
 * List all memory books for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

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
      return res.status(404).json({
        success: false,
        error: {
          code: 'MEMORY_BOOK_NOT_FOUND',
          message: 'Memory book not found',
        },
      });
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
 * POST /api/memory-books/:bookId/generate
 * Trigger generation of a memory book for a specific book
 */
router.post('/:bookId/generate', authenticate, async (req: AuthRequest, res) => {
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOK_NOT_FOUND',
          message: 'Book not found',
        },
      });
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'MEMORY_BOOK_NOT_FOUND',
          message: 'Memory book not found',
        },
      });
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
