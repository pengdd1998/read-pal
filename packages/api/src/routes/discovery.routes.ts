/**
 * Discovery Routes
 *
 * Book search, recommendations, and free book listing endpoints.
 */

import { Router } from 'express';
import { Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { Op } from 'sequelize';

const router: Router = Router();

/**
 * GET /api/discovery/search
 * Search user's library by title, author, or status
 */
router.get('/search', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const { q, status, sortBy = 'lastReadAt', order = 'DESC' } = req.query;

    // Validate search query length to prevent abuse
    if (q && typeof q === 'string' && q.length > 200) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Search query must be under 200 characters' },
      });
    }

    const whereClause: Record<string, unknown> = { userId: req.userId };

    if (q) {
      whereClause[Op.or as unknown as string] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { author: { [Op.iLike]: `%${q}%` } },
      ];
    }

    if (status && ['unread', 'reading', 'completed'].includes(status as string)) {
      whereClause.status = status;
    }

    const allowedSortFields = ['title', 'author', 'addedAt', 'lastReadAt', 'progress'];
    const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'lastReadAt';
    const sortOrder = (order as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const books = await Book.findAll({
      where: whereClause,
      order: [[sortField as string, sortOrder]],
      limit: 50,
    });

    res.json({ success: true, data: books });
  } catch (error) {
    console.error('Error searching library:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_ERROR', message: 'Failed to search library' },
    });
  }
});

/**
 * GET /api/discovery/recommendations
 * Get book recommendations based on reading history
 */
router.get('/recommendations', authenticate, rateLimiter({ windowMs: 60000, max: 20 }), async (req: AuthRequest, res) => {
  try {
    // Get user's reading history to find patterns
    const completedBooks = await Book.findAll({
      where: { userId: req.userId, status: 'completed' },
      attributes: ['author', 'title'],
      limit: 10,
    });

    const readingBooks = await Book.findAll({
      where: { userId: req.userId, status: 'reading' },
      attributes: ['author', 'title'],
      limit: 10,
    });

    // Extract favorite authors
    const authorCounts: Record<string, number> = {};
    for (const book of completedBooks) {
      const author = book.author;
      if (author) {
        authorCounts[author] = (authorCounts[author] || 0) + 1;
      }
    }

    const topAuthors = Object.entries(authorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([author]) => author);

    // Recommend books from the same authors that user hasn't read
    const existingTitles = [...completedBooks, ...readingBooks].map(b => b.title);

    const recommendations = topAuthors.length > 0
      ? await Book.findAll({
          where: {
            userId: req.userId,
            author: { [Op.in]: topAuthors },
            title: { [Op.notIn]: existingTitles.length > 0 ? existingTitles : [''] },
            status: { [Op.ne]: 'completed' },
          },
          limit: 5,
        })
      : [];

    res.json({
      success: true,
      data: {
        topAuthors,
        recommendations,
        stats: {
          booksCompleted: completedBooks.length,
          booksReading: readingBooks.length,
        },
      },
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RECOMMENDATIONS_ERROR', message: 'Failed to get recommendations' },
    });
  }
});

/**
 * GET /api/discovery/free-books
 * List free public domain books for import
 */
router.get('/free-books', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const { query, page = 1 } = req.query;

    // Curated list of popular public domain books
    const freeBooks = [
      { id: 'pg-1342', title: 'Pride and Prejudice', author: 'Jane Austen', language: 'en', pages: 432 },
      { id: 'pg-11', title: 'Alice\'s Adventures in Wonderland', author: 'Lewis Carroll', language: 'en', pages: 200 },
      { id: 'pg-1661', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', language: 'en', pages: 307 },
      { id: 'pg-46', title: 'A Christmas Carol', author: 'Charles Dickens', language: 'en', pages: 84 },
      { id: 'pg-84', title: 'Frankenstein', author: 'Mary Shelley', language: 'en', pages: 280 },
      { id: 'pg-98', title: 'A Tale of Two Cities', author: 'Charles Dickens', language: 'en', pages: 489 },
      { id: 'pg-2701', title: 'Moby Dick', author: 'Herman Melville', language: 'en', pages: 732 },
      { id: 'pg-1232', title: 'The Prince', author: 'Niccolò Machiavelli', language: 'en', pages: 140 },
      { id: 'pg-174', title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', language: 'en', pages: 254 },
      { id: 'pg-5200', title: 'Metamorphosis', author: 'Franz Kafka', language: 'en', pages: 87 },
      { id: 'pg-1260', title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', language: 'en', pages: 671 },
      { id: 'pg-2591', title: 'The Time Machine', author: 'H.G. Wells', language: 'en', pages: 118 },
      { id: 'pg-16', title: 'Peter Pan', author: 'J.M. Barrie', language: 'en', pages: 176 },
      { id: 'pg-74', title: 'The Count of Monte Cristo', author: 'Alexandre Dumas', language: 'en', pages: 1276 },
      { id: 'pg-1400', title: 'Great Expectations', author: 'Charles Dickens', language: 'en', pages: 544 },
      { id: 'pg-345', title: 'Dracula', author: 'Bram Stoker', language: 'en', pages: 418 },
      { id: 'pg-76', title: 'The Adventures of Huckleberry Finn', author: 'Mark Twain', language: 'en', pages: 366 },
      { id: 'pg-203', title: 'Uncle Tom\'s Cabin', author: 'Harriet Beecher Stowe', language: 'en', pages: 536 },
      { id: 'pg-2148', title: 'The Strange Case of Dr Jekyll and Mr Hyde', author: 'Robert Louis Stevenson', language: 'en', pages: 88 },
      { id: 'pg-2147', title: 'Treasure Island', author: 'Robert Louis Stevenson', language: 'en', pages: 292 },
    ];

    let filtered = freeBooks;
    if (query) {
      const q = String(query).toLowerCase();
      filtered = freeBooks.filter(b =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      );
    }

    const pageSize = 10;
    const startIdx = ((parseInt(page as string) || 1) - 1) * pageSize;
    const paged = filtered.slice(startIdx, startIdx + pageSize);

    res.json({
      success: true,
      data: paged,
      pagination: {
        page: parseInt(page as string) || 1,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
      },
    });
  } catch (error) {
    console.error('Error listing free books:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FREE_BOOKS_ERROR', message: 'Failed to list free books' },
    });
  }
});

export default router;
