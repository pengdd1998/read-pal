/**
 * Annotations Routes
 */

import { Router } from 'express';
import { Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { Op } from 'sequelize';

const router = Router();

/**
 * GET /api/annotations
 * Get all annotations for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, type, tags } = req.query;

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
    });

    res.json({
      success: true,
      data: annotations,
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
router.post('/', authenticate, async (req: AuthRequest, res) => {
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

    if (content !== undefined) annotation.content = content;
    if (note !== undefined) annotation.note = note;
    if (color !== undefined) annotation.color = color;
    if (tags !== undefined) annotation.tags = tags;

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

export default router;
