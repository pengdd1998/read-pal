/**
 * Data Export Route
 *
 * Allows users to export all their data as a JSON file for portability.
 */

import { Router, Response } from 'express';
import { Book, Annotation, ReadingSession, User } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

/**
 * GET /api/export
 * Export all user data as JSON
 */
router.get('/', authenticate, rateLimiter({ windowMs: 60000, max: 5 }), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const [user, books, annotations, sessions] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'email', 'name', 'createdAt'] }),
      Book.findAll({ where: { userId }, raw: true }),
      Annotation.findAll({ where: { userId }, raw: true }),
      ReadingSession.findAll({ where: { userId }, raw: true }),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } : null,
      books,
      annotations,
      readingSessions: sessions,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="readpal-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Data export error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_ERROR', message: 'Failed to export data' },
    });
  }
});

export default router;
