/**
 * Annotations Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { Op } from 'sequelize';

const router: Router = Router();

/**
 * GET /api/annotations
 * Get all annotations for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, type, tags } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const where: any = { userId: req.userId };

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

    const annotations = await Annotation.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    const total = await Annotation.count({ where });

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
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANNOTATION_NOT_FOUND',
          message: 'Annotation not found',
        },
      });
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANNOTATION_NOT_FOUND',
          message: 'Annotation not found',
        },
      });
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'ANNOTATION_NOT_FOUND',
          message: 'Annotation not found',
        },
      });
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

/**
 * GET /api/annotations/export
 * Export annotations for a book as Markdown or JSON
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

    const annotations = await Annotation.findAll({
      where: { userId: req.userId, bookId },
      order: [['createdAt', 'ASC']],
    });

    const fmt = (format as string) || 'markdown';

    if (fmt === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="annotations-${bookId}.json"`);
      return res.json(annotations);
    }

    // Markdown export
    const lines: string[] = [`# Annotations`, ``, `_Exported ${new Date().toLocaleDateString()}_`, ``];

    const highlights = annotations.filter((a) => a.type === 'highlight');
    const notes = annotations.filter((a) => a.type === 'note');
    const bookmarks = annotations.filter((a) => a.type === 'bookmark');

    if (highlights.length > 0) {
      lines.push(`## Highlights (${highlights.length})`, ``);
      for (const h of highlights) {
        lines.push(`> ${h.content.replace(/\n/g, '\n> ')}`);
        if (h.note) lines.push(``, `**Note:** ${h.note}`);
        if (h.color) lines.push(``, `_Color: ${h.color}_`);
        lines.push(``);
      }
    }

    if (notes.length > 0) {
      lines.push(`## Notes (${notes.length})`, ``);
      for (const n of notes) {
        lines.push(`### ${n.content.slice(0, 60)}${n.content.length > 60 ? '...' : ''}`);
        if (n.note) lines.push(``, n.note);
        lines.push(``);
      }
    }

    if (bookmarks.length > 0) {
      lines.push(`## Bookmarks (${bookmarks.length})`, ``);
      for (const b of bookmarks) {
        const loc = b.location?.pageNumber ? ` (p. ${b.location.pageNumber})` : '';
        lines.push(`- ${b.content}${loc}`);
      }
      lines.push(``);
    }

    if (annotations.length === 0) {
      lines.push(`_No annotations yet._`);
    }

    const md = lines.join('\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="annotations-${bookId}.md"`);
    res.send(md);
  } catch (error) {
    console.error('Error exporting annotations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_ERROR', message: 'Failed to export annotations' },
    });
  }
});

export default router;
