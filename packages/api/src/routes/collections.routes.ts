/**
 * Collections Routes — CRUD for user bookshelves
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { Collection } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimiter } from '../middleware/rateLimiter';
import { notFound } from '../utils/errors';

const router: Router = Router();

/**
 * GET /api/collections
 * List all collections for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const collections = await Collection.findAll({
      where: { userId: req.userId },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: collections.map((c) => ({
        ...c.toJSON(),
        bookCount: c.bookIds.length,
      })),
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({
      success: false,
      error: { code: 'COLLECTIONS_FETCH_ERROR', message: 'Failed to fetch collections' },
    });
  }
});

/**
 * POST /api/collections
 * Create a new collection
 */
router.post(
  '/',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 30 }),
  validate([
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (1-100 chars)'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('icon').optional().trim().isLength({ max: 50 }),
    body('color').optional().trim().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Color must be a hex color'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { name, description, icon, color } = req.body;

      const collection = await Collection.create({
        userId: req.userId!,
        name,
        description: description || null,
        icon: icon || 'folder',
        color: color || '#f59e0b',
        bookIds: [],
      });

      res.status(201).json({
        success: true,
        data: { ...collection.toJSON(), bookCount: 0 },
      });
    } catch (error) {
      console.error('Error creating collection:', error);
      res.status(500).json({
        success: false,
        error: { code: 'COLLECTION_CREATE_ERROR', message: 'Failed to create collection' },
      });
    }
  },
);

/**
 * PATCH /api/collections/:id
 * Update a collection (name, description, icon, color)
 */
router.patch(
  '/:id',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 30 }),
  validate([
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('icon').optional().trim().isLength({ max: 50 }),
    body('color').optional().trim().matches(/^#[0-9a-fA-F]{6}$/),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const collection = await Collection.findOne({
        where: { id: req.params.id, userId: req.userId },
      });

      if (!collection) {
        return notFound(res, 'Collection');
      }

      const { name, description, icon, color } = req.body;
      if (name !== undefined) collection.name = name;
      if (description !== undefined) collection.description = description;
      if (icon !== undefined) collection.icon = icon;
      if (color !== undefined) collection.color = color;

      await collection.save();

      res.json({
        success: true,
        data: { ...collection.toJSON(), bookCount: collection.bookIds.length },
      });
    } catch (error) {
      console.error('Error updating collection:', error);
      res.status(500).json({
        success: false,
        error: { code: 'COLLECTION_UPDATE_ERROR', message: 'Failed to update collection' },
      });
    }
  },
);

/**
 * DELETE /api/collections/:id
 */
router.delete('/:id', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const collection = await Collection.findOne({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!collection) {
      return notFound(res, 'Collection');
    }

    await collection.destroy();

    res.json({ success: true, data: { id: collection.id } });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({
      success: false,
      error: { code: 'COLLECTION_DELETE_ERROR', message: 'Failed to delete collection' },
    });
  }
});

/**
 * POST /api/collections/:id/books
 * Add books to a collection
 */
router.post(
  '/:id/books',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 30 }),
  validate([
    body('bookIds').isArray({ min: 1 }).withMessage('bookIds must be a non-empty array'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const collection = await Collection.findOne({
        where: { id: req.params.id, userId: req.userId },
      });

      if (!collection) {
        return notFound(res, 'Collection');
      }

      const { bookIds }: { bookIds: string[] } = req.body;
      const current = new Set(collection.bookIds);
      for (const id of bookIds) {
        if (typeof id === 'string') current.add(id);
      }
      collection.bookIds = Array.from(current);
      await collection.save();

      res.json({
        success: true,
        data: { ...collection.toJSON(), bookCount: collection.bookIds.length },
      });
    } catch (error) {
      console.error('Error adding books to collection:', error);
      res.status(500).json({
        success: false,
        error: { code: 'COLLECTION_BOOKS_ADD_ERROR', message: 'Failed to add books' },
      });
    }
  },
);

/**
 * POST /api/collections/:id/books/remove
 * Remove books from a collection
 */
router.post(
  '/:id/books/remove',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 30 }),
  validate([
    body('bookIds').isArray({ min: 1 }).withMessage('bookIds must be a non-empty array'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const collection = await Collection.findOne({
        where: { id: req.params.id, userId: req.userId },
      });

      if (!collection) {
        return notFound(res, 'Collection');
      }

      const { bookIds }: { bookIds: string[] } = req.body;
      const removeSet = new Set(bookIds);
      collection.bookIds = collection.bookIds.filter((id) => !removeSet.has(id));
      await collection.save();

      res.json({
        success: true,
        data: { ...collection.toJSON(), bookCount: collection.bookIds.length },
      });
    } catch (error) {
      console.error('Error removing books from collection:', error);
      res.status(500).json({
        success: false,
        error: { code: 'COLLECTION_BOOKS_REMOVE_ERROR', message: 'Failed to remove books' },
      });
    }
  },
);

export default router;
