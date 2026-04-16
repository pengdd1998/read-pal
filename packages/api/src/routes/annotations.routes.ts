/**
 * Annotations Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { etag } from '../middleware/cache';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../models';
import { parsePagination } from '../utils/pagination';
import { notFound } from '../utils/errors';
import { exportAnnotations, type ExportFormat } from '../services/ExportService';
import { Book } from '../models';

const router: Router = Router();

/**
 * Escape markdown special characters in user content to prevent
 * injection when the exported markdown is rendered.
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * GET /api/annotations
 * Get all annotations for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, type, tags } = req.query;
    const { page, limit, offset } = parsePagination(req, 50);

    const where: Record<string, unknown> = { userId: req.userId };

    if (bookId) {
      where.bookId = bookId;
    }

    if (type) {
      where.type = type;
    }

    if (tags) {
      where.tags = {
        [Op.overlap]: Array.isArray(tags) ? tags : [tags],
      };
    }

    const { rows: annotations, count: total } = await Annotation.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: annotations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching annotations:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOTATIONS_FETCH_ERROR',
        message: 'Failed to fetch annotations',
      },
    });
  }
});

/**
 * GET /api/annotations/tags
 * Get all unique tags for the authenticated user with counts
 */
router.get('/tags', authenticate, etag(120), async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.query;

    // Use PostgreSQL unnest + GROUP BY for efficient server-side tag counting
    // instead of fetching all annotations into JS memory
    let whereClause = 'WHERE user_id = $1 AND tags IS NOT NULL';
    const binds: unknown[] = [req.userId];
    if (bookId) {
      whereClause += ' AND book_id = $2';
      binds.push(bookId);
    }

    const tags = await sequelize.query<{ tag: string; count: string }>(
      `SELECT unnest(tags) AS tag, COUNT(*)::int AS count
       FROM annotations
       ${whereClause}
       GROUP BY unnest(tags)
       ORDER BY count DESC`,
      { bind: binds, type: QueryTypes.SELECT },
    );

    res.json({ success: true, data: tags.map((r) => ({ name: r.tag, count: r.count })) });
  } catch (error) {
    console.error('Error fetching annotation tags:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TAGS_FETCH_ERROR', message: 'Failed to fetch tags' },
    });
  }
});

/**
 * GET /api/annotations/search
 * Search annotations by text content (server-side filtering)
 */
router.get('/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const { q, bookId, type } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    if (!q || typeof q !== 'string' || q.trim().length < 1 || q.trim().length > 200) {
      return res.json({ success: true, data: [] });
    }

    const search = q.trim().toLowerCase();
    const where: Record<string, unknown> = { userId: req.userId };

    if (bookId) where.bookId = bookId;
    if (type) where.type = type;

    const annotations = await Annotation.findAll({
      where: {
        ...where,
        [Op.or]: [
          { content: { [Op.iLike]: `%${search}%` } },
          { note: { [Op.iLike]: `%${search}%` } },
        ],
      },
      order: [['createdAt', 'DESC']],
      limit,
    });

    res.json({ success: true, data: annotations });
  } catch (error) {
    console.error('Error searching annotations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ANNOTATIONS_SEARCH_ERROR', message: 'Failed to search annotations' },
    });
  }
});

/**
 * GET /api/annotations/export
 * Export annotations for a book as Markdown or JSON
 * NOTE: Must be defined before /:id to avoid route capture
 */
router.get('/export', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, format } = req.query;

    if (!bookId || typeof bookId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bookId query parameter is required' },
      });
    }

    const fmt = (format as string) || 'markdown';

    // Legacy formats: json and markdown remain inline
    const annotations = await Annotation.findAll({
      where: { userId: req.userId, bookId },
      order: [['createdAt', 'ASC']],
    });

    if (fmt === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="annotations-${bookId}.json"`);
      return res.json(annotations);
    }

    if (fmt === 'markdown') {
      const lines: string[] = [`# Annotations`, ``, `_Exported ${new Date().toLocaleDateString()}_`, ``];

      const highlights = annotations.filter((a) => a.type === 'highlight');
      const notes = annotations.filter((a) => a.type === 'note');
      const bookmarks = annotations.filter((a) => a.type === 'bookmark');

      if (highlights.length > 0) {
        lines.push(`## Highlights (${highlights.length})`, ``);
        for (const h of highlights) {
          lines.push(`> ${escapeMarkdown(h.content).replace(/\n/g, '\n> ')}`);
          if (h.note) lines.push(``, `**Note:** ${escapeMarkdown(h.note)}`);
          if (h.color) lines.push(``, `_Color: ${h.color}_`);
          lines.push(``);
        }
      }

      if (notes.length > 0) {
        lines.push(`## Notes (${notes.length})`, ``);
        for (const n of notes) {
          lines.push(`### ${escapeMarkdown(n.content.slice(0, 60))}${n.content.length > 60 ? '...' : ''}`);
          if (n.note) lines.push(``, escapeMarkdown(n.note));
          lines.push(``);
        }
      }

      if (bookmarks.length > 0) {
        lines.push(`## Bookmarks (${bookmarks.length})`, ``);
        for (const b of bookmarks) {
          const loc = b.location?.pageNumber ? ` (p. ${b.location.pageNumber})` : '';
          lines.push(`- ${escapeMarkdown(b.content)}${loc}`);
        }
        lines.push(``);
      }

      if (annotations.length === 0) {
        lines.push(`_No annotations yet._`);
      }

      const md = lines.join('\n');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="annotations-${bookId}.md"`);
      return res.send(md);
    }

    // New formats: delegate to ExportService (requires book metadata)
    const validFormats: ExportFormat[] = ['bookclub', 'bibtex', 'apa', 'mla', 'chicago', 'research'];
    if (!validFormats.includes(fmt as ExportFormat)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Unsupported format "${fmt}". Supported: markdown, json, ${validFormats.join(', ')}` },
      });
    }

    const book = await Book.findByPk(bookId);
    if (!book) {
      return notFound(res, 'book');
    }

    const result = await exportAnnotations(
      fmt as ExportFormat,
      { title: book.title, author: book.author, metadata: book.metadata },
      annotations.map((a) => ({
        type: a.type,
        content: a.content,
        note: a.note || undefined,
        color: a.color || undefined,
        tags: a.tags || undefined,
        location: a.location as Record<string, unknown> | undefined,
        createdAt: a.createdAt,
      })),
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (error) {
    console.error('Error exporting annotations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_ERROR', message: 'Failed to export annotations' },
    });
  }
});

/**
 * GET /api/annotations/:id
 * Get a specific annotation
 */
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const annotation = await Annotation.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!annotation) {
      return notFound(res, 'Annotation');
    }

    res.json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    console.error('Error fetching annotation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOTATION_FETCH_ERROR',
        message: 'Failed to fetch annotation',
      },
    });
  }
});

/**
 * POST /api/annotations
 * Create a new annotation
 */
router.post(
  '/',
  rateLimiter({ windowMs: 60000, max: 30 }),
  authenticate,
  validate([
    body('bookId').isString().withMessage('bookId is required and must be a string'),
    body('type').isIn(['highlight', 'note', 'bookmark']).withMessage('type must be highlight, note, or bookmark'),
    body('content').isLength({ max: 10000 }).withMessage('content is required and must be at most 10000 characters'),
    body('location').optional().isObject().withMessage('location must be an object'),
    body('tags').optional().isArray().withMessage('tags must be an array'),
    body('tags.*').optional().isString().trim().isLength({ max: 50 }).withMessage('each tag must be a string under 50 characters'),
  ]),
  async (req: AuthRequest, res) => {
  try {
    const { bookId, type, content, location, color, note, tags } = req.body;

    const annotation = await Annotation.create({
      userId: req.userId!,
      bookId,
      type,
      content,
      location,
      color,
      note,
      tags: tags || [],
    });

    res.status(201).json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    console.error('Error creating annotation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOTATION_CREATE_ERROR',
        message: 'Failed to create annotation',
      },
    });
  }
});

/**
 * PATCH /api/annotations/:id
 * Update an annotation
 */
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const annotation = await Annotation.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!annotation) {
      return notFound(res, 'Annotation');
    }

    const { content, note, color, tags } = req.body;

    if (content !== undefined) {
      if (typeof content !== 'string' || content.length > 10000) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'content must be a string under 10000 characters',
          },
        });
      }
      annotation.content = content;
    }
    if (note !== undefined) {
      if (typeof note !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'note must be a string' },
        });
      }
      annotation.note = note;
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'color must be a valid hex color (e.g. #ff5500)' },
        });
      }
      annotation.color = color;
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string')) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'tags must be an array of strings' },
        });
      }
      annotation.tags = tags;
    }

    await annotation.save();

    res.json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    console.error('Error updating annotation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOTATION_UPDATE_ERROR',
        message: 'Failed to update annotation',
      },
    });
  }
});

/**
 * DELETE /api/annotations/:id
 * Delete an annotation
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const annotation = await Annotation.findOne({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!annotation) {
      return notFound(res, 'Annotation');
    }

    await annotation.destroy();

    res.json({
      success: true,
      data: { id: annotation.id },
    });
  } catch (error) {
    console.error('Error deleting annotation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANNOTATION_DELETE_ERROR',
        message: 'Failed to delete annotation',
      },
    });
  }
});

export default router;
