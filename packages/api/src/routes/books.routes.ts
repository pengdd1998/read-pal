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
       WHERE user_id = $1 AND tags IS NOT NULL
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
        where: { userId, title: "Alice's Adventures in Wonderland (Sample)" },
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
          title: 'Chapter 1: Down the Rabbit Hole',
          content: `<h1>Chapter 1: Down the Rabbit Hole</h1>
<p>Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, <em>"and what is the use of a book,"</em> thought Alice <em>"without pictures or conversations?"</em></p>

<p>So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a <strong>White Rabbit</strong> with pink eyes ran close by her.</p>

<p>There was nothing so VERY remarkable in that; nor did Alice think it so VERY much out of the way to hear the Rabbit say to itself, <em>"Oh dear\! Oh dear\! I shall be late\!"</em> (when she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural); but when the Rabbit actually <strong>took a watch out of its waistcoat-pocket</strong>, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.</p>

<p>In another moment down went Alice after it, never once considering how in the world she was to get out again.</p>

<h2>Falling Down</h2>

<p>The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well.</p>

<p>Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next. First, she tried to look down and make out what she was coming to, but it was too dark to see anything; then she looked at the sides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs. She took down a jar from one of the shelves as she passed; it was labelled <em>"ORANGE MARMALADE"</em>, but to her great disappointment it was empty: she did not like to drop the jar for fear of killing somebody, so managed to put it into one of the cupboards as she fell past it.</p>

<blockquote><p>"Well\!" thought Alice to herself, "After a fall like this, I shall think nothing of tumbling down stairs\! How brave they'll all think me at home\! Why, I wouldn't say anything about it, even if I fell off the top of the house\!" (Which was very likely true.)</p></blockquote>

<p>Down, down, down. Would the fall NEVER come to an end\! <em>"I wonder how many miles I've fallen by this time?"</em> she said aloud. <em>"I must be getting somewhere near the centre of the earth. Let me see: that would be four thousand miles down, I think."</em></p>

<p><strong>Try selecting this text to highlight it or ask your AI companion about it\!</strong></p>`,

          startIndex: 0,
          endIndex: 1500,
          order: 0,
        },
        {
          id: 'sample-ch2',
          title: 'Chapter 2: The Pool of Tears',
          content: `<h1>Chapter 2: The Pool of Tears</h1>

<p>"Curiouser and curiouser\!" cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English). "Now I'm opening out like the largest telescope that ever was\! Good-bye, feet\!"</p>

<p>First, however, she waited for a few minutes to see if she was going to shrink any further: she felt a little nervous about this; <em>"for it might end, you know,"</em> said Alice to herself, <em>"in my going out altogether, like a candle. I wonder what I should be like then?"</em> And she tried to fancy what the flame of a candle is like after the candle is blown out, for she could not remember ever having seen such a thing.</p>

<h2>Advice from a Caterpillar</h2>

<p>After a while she remembered that she still held the pieces of mushroom in her hands, and she set to work very carefully, nibbling first at one and then at the other, and growing sometimes taller and sometimes shorter, until she had succeeded in bringing herself down to her usual height.</p>

<p>It was so long since she had been anything near the right size, that it felt quite strange at first; but she got used to it in a few minutes, and began talking to herself, as usual. <em>"Come, there's half my plan done now\! How puzzling all these changes are\! I'm never sure what I'm going to be, from one minute to another."</em></p>

<blockquote><p>"Who are YOU?" said the Caterpillar.

This was not an encouraging opening for a conversation. Alice replied, rather shyly, "I — I hardly know, sir, just at present — at least I know who I WAS when I got up this morning, but I think I must have been changed several times since then."</p></blockquote>

<p><strong>Select any passage to highlight it, add a note, or ask your AI companion to explain it\!</strong></p>`,

          startIndex: 1500,
          endIndex: 3000,
          order: 1,
        },
        {
          id: 'sample-ch3',
          title: 'Chapter 3: A Mad Tea-Party',
          content: `<h1>Chapter 3: A Mad Tea-Party</h1>

<p>There was a table set out under a tree in front of the house, and the <strong>March Hare</strong> and the <strong>Hatter</strong> were having tea at it: a <strong>Dormouse</strong> was sitting between them, fast asleep, and the other two were using it as a cushion, resting their elbows on it, and talking over its head.</p>

<p><em>"Very uncomfortable for the Dormouse,"</em> thought Alice; <em>"only, as it's asleep, I suppose it doesn't mind."</em></p>

<p>The table was a large one, but the three were all crowded together at one corner of it: <em>"No room\! No room\!"</em> they cried out when they saw Alice coming. <em>"There's PLENTY of room\!"</em> said Alice indignantly, and she sat down in a large arm-chair at one end of the table.</p>

<h2>"Why is a raven like a writing-desk?"</h2>

<p>"Have some wine," the March Hare said in an encouraging tone.</p>

<p>Alice looked all round the table, but there was nothing on it but tea. "I don't see any wine," she remarked.</p>

<p>"There isn't any," said the March Hare.</p>

<p>"Then it wasn't very civil of you to offer it," said Alice angrily.</p>

<p>"It wasn't very civil of you to sit down without being invited," said the March Hare.</p>

<blockquote><p>"Why is a raven like a writing-desk?"

"Come, we shall have some fun now\!" thought Alice. "I'm glad they've begun asking riddles. — I believe I can guess that," she added aloud.

"Do you mean that you think you can find out the answer to it?" said the March Hare.</p></blockquote>

<p>This is one of the most famous riddles in literature — and Lewis Carroll never intended for it to have an answer\! It's a perfect example of the <strong>nonsense logic</strong> that runs through Wonderland. Try asking your AI companion what they think about this riddle\!</p>

<p><strong>You've finished the sample chapters\! Upload your own books to continue your reading journey with read-pal.</strong></p>`,

          startIndex: 3000,
          endIndex: 4500,
          order: 2,
        },
      ];

      const fullContent = chapters.map((ch) => ch.content).join('\n\n');

      // Create book record
      const book = await Book.create({
        userId,
        title: "Alice's Adventures in Wonderland (Sample)",
        author: 'Lewis Carroll',
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
          message: 'Sample book added to your library\!',
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
