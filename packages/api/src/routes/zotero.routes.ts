/**
 * Zotero Integration Routes
 *
 * Export reading annotations and bibliography entries to Zotero.
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { User, Book, Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { notFound } from '../utils/errors';
import { ZoteroService, getZoteroConfig } from '../services/ZoteroService';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserWithSettings(userId: string) {
  const user = await User.findByPk(userId);
  if (!user) return null;
  const settings =
    typeof user.settings === 'object' && user.settings !== null
      ? (user.settings as Record<string, unknown>)
      : {};
  return { user, settings };
}

// ---------------------------------------------------------------------------
// POST /api/zotero/validate — Validate Zotero API key
// ---------------------------------------------------------------------------
router.post(
  '/validate',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 10 }),
  validate([
    body('apiKey').isString().trim().isLength({ min: 1, max: 100 }),
    body('userId').isString().trim().isLength({ min: 1, max: 50 }),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { apiKey, userId: zoteroUserId } = req.body;
      const zotero = new ZoteroService({ apiKey, userId: zoteroUserId });
      const result = await zotero.validate();
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error validating Zotero key:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ZOTERO_VALIDATE_ERROR', message: 'Failed to validate Zotero credentials' },
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/zotero/status — Check if Zotero is configured
// ---------------------------------------------------------------------------
router.get('/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await getUserWithSettings(req.userId!);
    if (!result) return notFound(res, 'User');

    const config = getZoteroConfig(result.settings);
    res.json({
      success: true,
      data: {
        connected: !!config,
        userId: config?.userId ?? null,
      },
    });
  } catch (error) {
    console.error('Error checking Zotero status:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ZOTERO_STATUS_ERROR', message: 'Failed to check Zotero status' },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/zotero/export/:bookId — Export book annotations to Zotero
// ---------------------------------------------------------------------------
router.post(
  '/export/:bookId',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 5 }),
  async (req: AuthRequest, res) => {
    try {
      const result = await getUserWithSettings(req.userId!);
      if (!result) return notFound(res, 'User');

      const config = getZoteroConfig(result.settings);
      if (!config) {
        return res.status(400).json({
          success: false,
          error: { code: 'ZOTERO_NOT_CONFIGURED', message: 'Zotero not configured. Add your API key in Settings.' },
        });
      }

      // Fetch book
      const book = await Book.findOne({
        where: { id: req.params.bookId, userId: req.userId! },
      });
      if (!book) {
        return notFound(res, 'Book');
      }

      // Fetch annotations
      const annotations = await Annotation.findAll({
        where: { bookId: req.params.bookId, userId: req.userId! },
        attributes: ['type', 'content', 'note', 'tags', 'createdAt', 'location'],
        order: [['createdAt', 'ASC']],
        raw: true,
      });

      const bookData = book.get({ plain: true });
      const highlights = annotations
        .filter((a) => a.type === 'highlight')
        .map((a) => ({
          content: a.content,
          chapterIndex: (a.location as Record<string, unknown> | null)?.chapterIndex as number | undefined,
          createdAt: a.createdAt as unknown as string,
        }));

      const notes = annotations
        .filter((a) => a.type === 'note')
        .map((a) => ({
          content: a.content,
          note: a.note ?? undefined,
          chapterIndex: (a.location as Record<string, unknown> | null)?.chapterIndex as number | undefined,
          createdAt: a.createdAt as unknown as string,
        }));

      const zotero = new ZoteroService(config);
      const exportResult = await zotero.exportBookWithAnnotations({
        title: bookData.title,
        author: bookData.author,
        tags: bookData.tags as string[] | undefined,
        highlights,
        notes,
      });

      res.json({
        success: true,
        data: {
          message: `Exported to Zotero: ${highlights.length} highlights, ${notes.length} notes`,
          bookItemKey: exportResult.bookItemKey,
          noteItemKey: exportResult.noteItemKey,
          itemsCreated: exportResult.itemsCreated,
        },
      });
    } catch (error) {
      console.error('Error exporting to Zotero:', error);
      const message = error instanceof Error ? error.message : 'Failed to export to Zotero';
      res.status(500).json({
        success: false,
        error: { code: 'ZOTERO_EXPORT_ERROR', message },
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/zotero/export-all — Export all completed books
// ---------------------------------------------------------------------------
router.post(
  '/export-all',
  authenticate,
  rateLimiter({ windowMs: 300000, max: 2 }),
  async (req: AuthRequest, res) => {
    try {
      const result = await getUserWithSettings(req.userId!);
      if (!result) return notFound(res, 'User');

      const config = getZoteroConfig(result.settings);
      if (!config) {
        return res.status(400).json({
          success: false,
          error: { code: 'ZOTERO_NOT_CONFIGURED', message: 'Zotero not configured' },
        });
      }

      const books = await Book.findAll({
        where: { userId: req.userId!, status: 'completed' },
        attributes: ['id', 'title', 'author', 'tags'],
      });

      const zotero = new ZoteroService(config);
      const exported: Array<{ title: string; itemsCreated: number }> = [];
      const errors: Array<{ title: string; error: string }> = [];

      for (const book of books) {
        try {
          const bookData = book.get({ plain: true });
          const annotations = await Annotation.findAll({
            where: { bookId: book.id, userId: req.userId! },
            attributes: ['type', 'content', 'note', 'location'],
            raw: true,
          });

          const highlights = annotations
            .filter((a) => a.type === 'highlight')
            .map((a) => ({
              content: a.content,
              chapterIndex: (a.location as Record<string, unknown> | null)?.chapterIndex as number | undefined,
            }));

          const notes = annotations
            .filter((a) => a.type === 'note')
            .map((a) => ({
              content: a.content,
              note: a.note ?? undefined,
              chapterIndex: (a.location as Record<string, unknown> | null)?.chapterIndex as number | undefined,
            }));

          const exportResult = await zotero.exportBookWithAnnotations({
            title: bookData.title,
            author: bookData.author,
            tags: bookData.tags as string[] | undefined,
            highlights,
            notes,
          });

          exported.push({ title: bookData.title, itemsCreated: exportResult.itemsCreated });
        } catch (err) {
          const bookData = book.get({ plain: true });
          errors.push({
            title: bookData.title,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        data: {
          exported,
          errors,
          totalExported: exported.length,
          totalErrors: errors.length,
        },
      });
    } catch (error) {
      console.error('Error exporting all to Zotero:', error);
      res.status(500).json({
        success: false,
        error: { code: 'ZOTERO_EXPORT_ALL_ERROR', message: 'Failed to export books to Zotero' },
      });
    }
  }
);

export default router;
