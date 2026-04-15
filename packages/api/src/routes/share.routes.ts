/**
 * Share Routes
 *
 * Generate shareable reading progress cards and public reading summaries.
 */

import { Router } from 'express';
import { notFound } from '../utils/errors';
import { Book, ReadingSession, Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

/**
 * GET /api/share/reading-card
 *
 * Returns a structured reading progress card that can be rendered
 * as a shareable image or embedded card.
 */
router.get('/reading-card', authenticate, rateLimiter({ windowMs: 60000, max: 20 }), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const [books, totalSessions, totalAnnotations] = await Promise.all([
      Book.findAll({
        where: { userId },
        attributes: ['id', 'title', 'author', 'progress', 'status', 'totalPages', 'currentPage', 'coverUrl'],
        order: [['lastReadAt', 'DESC NULLS LAST']],
        limit: 3,
      }),
      ReadingSession.count({ where: { userId } }),
      Annotation.count({ where: { userId } }),
    ]);

    const completedBooks = books.filter((b) => b.status === 'completed').length;
    const currentlyReading = books.find((b) => b.status === 'reading');
    const totalPages = books.reduce((sum, b) => sum + Math.round((Number(b.progress) / 100) * b.totalPages), 0);

    const card = {
      user: {
        name: (req.user as { name?: string })?.name || 'Reader',
      },
      stats: {
        booksCompleted: completedBooks,
        totalBooks: await Book.count({ where: { userId } }),
        totalPages,
        sessions: totalSessions,
        highlights: totalAnnotations,
      },
      currentlyReading: currentlyReading
        ? {
            title: currentlyReading.title,
            author: currentlyReading.author,
            progress: Math.round(Number(currentlyReading.progress)),
          }
        : null,
      recentBooks: books.slice(0, 3).map((b) => ({
        title: b.title,
        author: b.author,
        progress: Math.round(Number(b.progress)),
      })),
      generatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: card });
  } catch (error) {
    console.error('Error generating reading card:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_CARD_ERROR', message: 'Failed to generate reading card' },
    });
  }
});

/**
 * GET /api/share/book/:id
 *
 * Returns a shareable summary for a specific book.
 */
router.get('/book/:id', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!book) {
      return notFound(res, 'Book');
    }

    const annotations = await Annotation.findAll({
      where: { bookId: book.id, userId: req.userId, type: 'highlight' },
      attributes: ['content'],
      limit: 5,
      order: [['createdAt', 'DESC']],
    });

    const summary = {
      book: {
        title: book.title,
        author: book.author,
        fileType: book.fileType,
        progress: Math.round(Number(book.progress)),
        totalPages: book.totalPages,
        status: book.status,
      },
      topHighlights: annotations.map((a) => a.content),
      completedAt: book.completedAt?.toISOString() || null,
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error sharing book:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_BOOK_ERROR', message: 'Failed to generate book share' },
    });
  }
});

export default router;
