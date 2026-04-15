/**
 * Books Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { Book, Document, sequelize } from '../models';
import { QueryTypes } from 'sequelize';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { etag } from '../middleware/cache';
import { parsePagination } from '../utils/pagination';
import { notFound } from '../utils/errors';

const router: Router = Router();

/**
 * GET /api/books
 * Get all books for the authenticated user
 */
const ALLOWED_SORT_FIELDS = ['title', 'author', 'addedAt', 'lastReadAt', 'progress'] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    const rawSort = (req.query.sort as string) || 'addedAt';
    const sortField: SortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawSort)
      ? (rawSort as SortField)
      : 'addedAt';
    const rawOrder = (req.query.order as string) || 'desc';
    const order: 'ASC' | 'DESC' = rawOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { rows: books, count: total } = await Book.findAndCountAll({
      where: { userId: req.userId },
      order: [[sortField, order]],
      limit,
      offset,
    });

    // Cache book list for 30s — changes infrequently
    res.set('Cache-Control', 'private, max-age=30');
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
 * GET /api/books/tags
 * Get all unique tags for the authenticated user's library
 */
router.get('/tags', authenticate, async (req: AuthRequest, res) => {
  try {
    // Use PostgreSQL unnest + DISTINCT for efficient server-side tag extraction
    // instead of fetching all books into JS memory
    const result = await sequelize.query<{ tag: string }>(
      `SELECT DISTINCT unnest(tags) AS tag
       FROM books
       WHERE "userId" = $1 AND tags IS NOT NULL
       ORDER BY tag`,
      { bind: [req.userId], type: QueryTypes.SELECT },
    );

    res.json({
      success: true,
      data: result.map((r) => r.tag),
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TAGS_FETCH_ERROR', message: 'Failed to fetch tags' },
    });
  }
});

/**
 * PUT /api/books/:id/tags
 * Replace all tags on a book
 */
router.put('/:id/tags', authenticate, async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!book) {
      return notFound(res, 'Book');
    }

    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tags must be an array of strings' },
      });
    }

    const sanitized = tags
      .filter((t: unknown) => typeof t === 'string')
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0 && t.length <= 50)
      .slice(0, 20);

    book.tags = sanitized;
    await book.save();

    res.json({ success: true, data: book });
  } catch (error) {
    console.error('Error updating tags:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TAG_UPDATE_ERROR', message: 'Failed to update tags' },
    });
  }
});

/**
 * GET /api/books/:id
 * Get a specific book
 */
router.get('/:id', authenticate, etag(30), async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!book) {
      return notFound(res, 'Book');
    }

    // Cache book detail for 5 minutes — rarely changes
    res.set('Cache-Control', 'private, max-age=300');
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
      return notFound(res, 'Book');
    }

    const { currentPage, status, title, author, metadata } = req.body;

    // Update metadata fields (title, author)
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0 || title.length > 200) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title must be 1-200 characters' },
        });
      }
      book.title = title.trim();
    }

    if (author !== undefined) {
      if (typeof author !== 'string' || author.length > 200) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Author must be at most 200 characters' },
        });
      }
      book.author = author.trim() || 'Unknown Author';
    }

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'metadata must be an object' },
        });
      }
      book.metadata = { ...(book.metadata || {}), ...metadata };
    }

    const validStatuses = ['unread', 'reading', 'completed'];
    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Status must be one of: ${validStatuses.join(', ')}`,
          },
        });
      }
      book.status = status;
      if (status === 'reading' && !book.startedAt) {
        book.startedAt = new Date();
      }
      if (status === 'completed' && !book.completedAt) {
        book.completedAt = new Date();
      }
    }

    if (currentPage !== undefined) {
      if (typeof currentPage !== 'number' || currentPage < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'currentPage must be a non-negative number',
          },
        });
      }
      book.currentPage = currentPage;
      if (book.totalPages > 0) {
        book.progress = Math.min((currentPage / book.totalPages) * 100, 100);
      }
      book.lastReadAt = new Date();
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
      return notFound(res, 'Book');
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

/**
 * POST /api/books/seed-sample
 * Create a sample public-domain book for the authenticated user so they can
 * explore all features immediately without uploading a file.
 */
router.post(
  '/seed-sample',
  rateLimiter({ windowMs: 60000, max: 3 }),
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.userId!;

      // Prevent duplicate — check if user already has the sample book
      const existing = await Book.findOne({
        where: { userId, title: 'The Art of Reading (Sample)' },
      });
      if (existing) {
        return res.json({
          success: true,
          data: {
            book: {
              id: existing.id,
              title: existing.title,
              author: existing.author,
              fileType: existing.fileType,
              totalPages: existing.totalPages,
              status: existing.status,
              progress: existing.progress,
            },
            message: 'Sample book already exists in your library.',
          },
        });
      }

      const chapters = [
        {
          id: 'sample-ch1',
          title: 'Chapter 1: Why We Read',
          content: `<h1>Chapter 1: Why We Read</h1>
<p>We read to understand. We read to feel. We read to become someone we were not before we opened the book. Reading is one of the most profound acts of transformation available to us — a quiet, private revolution that takes place in the space between the page and the mind.</p>

<p>The philosopher <strong>Seneca</strong> once wrote: "We should hunt out the helpful pieces of teaching, and learn them by heart. This is the path to wisdom." Every book we read offers us this opportunity — not merely to consume information, but to be changed by it.</p>

<h2>The Three Pillars of Reading</h2>

<p>There are three fundamental reasons we return to books again and again:</p>

<ol>
<li><strong>Knowledge</strong> — Books are the most concentrated form of human knowledge ever devised. A single volume can contain the distilled wisdom of a lifetime of experience.</li>
<li><strong>Empathy</strong> — Through reading, we inhabit other minds. We see the world through different eyes. This is not a metaphor; neuroscience shows that reading fiction activates the same brain regions involved in real social understanding.</li>
<li><strong>Transcendence</strong> — Great writing lifts us beyond our immediate circumstances. It reminds us that our struggles are not unique, that others have walked similar paths and found meaning in the journey.</li>
</ol>

<p>When we read actively — underlining passages, asking questions, debating the author — we engage in a conversation that transcends time. The author speaks across decades or centuries, and we respond with our own experience and understanding.</p>

<blockquote><p>"A reader lives a thousand lives before he dies. The man who never reads lives only one." — George R.R. Martin</p></blockquote>

<p>This book is a companion for your reading journey. As you explore its pages, try highlighting passages that resonate with you, adding notes to capture your thoughts, and asking questions about anything that sparks your curiosity.</p>`,

          startIndex: 0,
          endIndex: 1500,
          order: 0,
        },
        {
          id: 'sample-ch2',
          title: 'Chapter 2: The Art of Active Reading',
          content: `<h1>Chapter 2: The Art of Active Reading</h1>

<p>Most people read passively — their eyes move across the page, but their mind is elsewhere. Active reading is different. It is a deliberate practice of engaging with the text, questioning it, and making it your own.</p>

<h2>The SQ3R Method</h2>

<p>One of the most effective reading strategies was developed by <strong>Francis P. Robinson</strong> in 1946. Called SQ3R, it stands for:</p>

<ul>
<li><strong>Survey</strong> — Skim the material first. Read headings, summaries, and any highlighted terms to build a mental map of what's coming.</li>
<li><strong>Question</strong> — Turn headings into questions. Instead of "The French Revolution," ask yourself "What caused the French Revolution?"</li>
<li><strong>Read</strong> — Now read carefully, looking for answers to your questions.</li>
<li><strong>Recite</strong> — After each section, pause and try to recall the main points in your own words.</li>
<li><strong>Review</strong> — After finishing, go back over your notes and highlights to reinforce what you've learned.</li>
</ul>

<h2>Why Highlights Matter</h2>

<p>Research from <strong>Cognitive Science</strong> shows that the act of selecting text to highlight creates a "generation effect" — you remember highlighted content 30-50% better than content you simply read. This is because the decision process forces deeper processing.</p>

<p>But not all highlighting is equal. The most effective approach is to highlight sparingly — aim for no more than 10-15% of a page. When you highlight everything, you highlight nothing.</p>

<h2>The Power of Marginalia</h2>

<p>Writing notes in the margins (or in a digital annotation system) is one of the most powerful learning techniques available. When you write a note, you:</p>

<ol>
<li>Force yourself to summarize the idea in your own words</li>
<li>Create a personal connection to the material</li>
<li>Build a searchable record of your thinking</li>
<li>Engage multiple cognitive systems (reading, thinking, writing)</li>
</ol>

<blockquote><p>"The marking of books is necessary for two reasons. First, it keeps you awake. Second, reading, if it is active, is thinking, and thinking tends to express itself in words." — Mortimer Adler</p></blockquote>

<p>Try it now: select a passage in this chapter that resonates with you and add a note explaining why it caught your attention.</p>`,

          startIndex: 1500,
          endIndex: 3000,
          order: 1,
        },
        {
          id: 'sample-ch3',
          title: 'Chapter 3: Building Your Knowledge Network',
          content: `<h1>Chapter 3: Building Your Knowledge Network</h1>

<p>Every book you read is a node in your personal knowledge network. When you read actively and reflect on connections between different works, you are not just accumulating facts — you are building a web of understanding that grows more valuable over time.</p>

<h2>The Zettelkasten Method</h2>

<p>The German sociologist <strong>Niklas Luhmann</strong> was one of the most prolific scholars of the 20th century, publishing over 70 books and 400 articles. His secret was a note-taking system he called <em>Zettelkasten</em> (slip-box).</p>

<p>The core principles are simple:</p>

<ul>
<li><strong>Atomic notes</strong> — Each note captures a single idea</li>
<li><strong>Linking</strong> — Notes are connected to related notes, forming a web</li>
<li><strong>Your own words</strong> — Never copy-paste; always rephrase</li>
<li><strong>Regular review</strong> — Revisit and refine your notes over time</li>
</ul>

<h2>Connecting Ideas Across Books</h2>

<p>One of the most powerful features of reading with an AI companion is the ability to discover connections you might miss. When you read about "cognitive biases" in a psychology book, then encounter "heuristics" in an economics text, the AI can help you see how these concepts relate.</p>

<p>These connections form a <strong>knowledge graph</strong> — a map of your intellectual journey that reveals patterns and insights invisible from any single book.</p>

<h2>The Compounding Returns of Reading</h2>

<p>Here is the beautiful truth about reading: the more you read, the more valuable each new book becomes. This is because each new book doesn't just add to your knowledge — it multiplies it.</p>

<p>Consider this: when you read your first book about economics, everything is new. By your fifth economics book, you begin to see patterns. By your tenth, you can predict arguments before they appear. Your knowledge compounds like interest in a bank account.</p>

<blockquote><p>"In the case of good books, the point is not to see how many of them you can get through, but rather how many can get through to you." — Mortimer J. Adler</p></blockquote>

<p>Congratulations on starting your reading journey with read-pal. As you add more books and engage with the AI companions, your knowledge network will grow richer and more interconnected. Happy reading!</p>`,

          startIndex: 3000,
          endIndex: 4500,
          order: 2,
        },
      ];

      const fullContent = chapters.map((ch) => ch.content).join('\n\n');

      // Create book record
      const book = await Book.create({
        userId,
        title: 'The Art of Reading (Sample)',
        author: 'read-pal',
        fileType: 'epub',
        fileSize: fullContent.length,
        totalPages: chapters.length,
        currentPage: 0,
        progress: 0,
        addedAt: new Date(),
        status: 'unread',
      });

      // Create document with chapter content
      await Document.create({
        bookId: book.id,
        userId,
        content: fullContent,
        chapters,
      });

      res.status(201).json({
        success: true,
        data: {
          book: {
            id: book.id,
            title: book.title,
            author: book.author,
            fileType: book.fileType,
            totalPages: book.totalPages,
            status: book.status,
            progress: book.progress,
          },
          message: 'Sample book added to your library!',
        },
      });
    } catch (error) {
      console.error('Error seeding sample book:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SEED_ERROR',
          message: 'Failed to create sample book',
        },
      });
    }
  },
);

export default router;
