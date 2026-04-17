/**
 * Data Export Route
 *
 * Allows users to export all their data as JSON or CSV.
 */

import { Router, Response } from 'express';
import { Book, Annotation, ReadingSession, User } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

/**
 * GET /api/export/csv?type=annotations|books|sessions
 * Export user data as CSV for data analysis (pandas, Excel, etc.)
 */
router.get('/csv', authenticate, rateLimiter({ windowMs: 60000, max: 5 }), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const type = (req.query.type as string) || 'annotations';

    let csv: string;
    let filename: string;

    if (type === 'books') {
      const books = await Book.findAll({ where: { userId }, raw: true });
      const headers = ['ID', 'Title', 'Author', 'Status', 'Progress', 'Total_Pages', 'Current_Page', 'Tags', 'Created_At', 'Updated_At'];
      const rows = books.map((b) => [
        escapeCsvField(b.id),
        escapeCsvField(b.title),
        escapeCsvField(b.author),
        escapeCsvField(b.status),
        escapeCsvField(String(b.progress ?? '')),
        escapeCsvField(String(b.totalPages ?? '')),
        escapeCsvField(String(b.currentPage ?? '')),
        escapeCsvField(Array.isArray(b.tags) ? (b.tags as string[]).join('; ') : ''),
        escapeCsvField(b.createdAt ? new Date(b.createdAt as unknown as string).toISOString() : ''),
        escapeCsvField(b.updatedAt ? new Date(b.updatedAt as unknown as string).toISOString() : ''),
      ].join(','));
      csv = [headers.join(','), ...rows].join('\n');
      filename = `readpal-books-${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (type === 'sessions') {
      const sessions = await ReadingSession.findAll({ where: { userId }, raw: true });
      const headers = ['ID', 'Book_ID', 'Duration_Seconds', 'Pages_Read', 'Highlights', 'Notes', 'Started_At', 'Ended_At'];
      const rows = sessions.map((s) => [
        escapeCsvField(s.id),
        escapeCsvField(s.bookId),
        escapeCsvField(String(s.duration ?? '')),
        escapeCsvField(String(s.pagesRead ?? '')),
        escapeCsvField(String(s.highlights ?? '')),
        escapeCsvField(String(s.notes ?? '')),
        escapeCsvField(s.startedAt ? new Date(s.startedAt as unknown as string).toISOString() : ''),
        escapeCsvField(s.endedAt ? new Date(s.endedAt as unknown as string).toISOString() : ''),
      ].join(','));
      csv = [headers.join(','), ...rows].join('\n');
      filename = `readpal-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      // Default: annotations with book title join
      const annotations = await Annotation.findAll({
        where: { userId },
        raw: true,
        attributes: ['id', 'bookId', 'type', 'content', 'note', 'color', 'tags', 'location', 'createdAt'],
      });

      // Build book title lookup
      const bookIds = [...new Set(annotations.map((a) => a.bookId))];
      const books = await Book.findAll({ where: { id: bookIds }, attributes: ['id', 'title'], raw: true });
      const bookMap = new Map(books.map((b) => [b.id, b.title]));

      const headers = ['ID', 'Book_Title', 'Type', 'Content', 'Note', 'Page', 'Chapter', 'Tags', 'Color', 'CFI', 'Created_At'];
      const rows = annotations.map((a) => {
        const loc = a.location as Record<string, unknown> | null;
        const page = loc?.pageNumber ?? '';
        const chapter = loc?.chapterIndex !== undefined && (loc?.chapterIndex as number) >= 0
          ? String((loc.chapterIndex as number) + 1) : '';
        const cfi = loc?.cfi ?? '';
        const tags = Array.isArray(a.tags) ? (a.tags as string[]).join('; ') : '';
        return [
          escapeCsvField(a.id),
          escapeCsvField(bookMap.get(a.bookId) ?? ''),
          escapeCsvField(a.type),
          escapeCsvField(a.content),
          escapeCsvField(a.note ?? ''),
          escapeCsvField(String(page)),
          escapeCsvField(chapter),
          escapeCsvField(tags),
          escapeCsvField(a.color ?? ''),
          escapeCsvField(String(cfi)),
          escapeCsvField(a.createdAt ? new Date(a.createdAt as unknown as string).toISOString() : ''),
        ].join(',');
      });
      csv = [headers.join(','), ...rows].join('\n');
      filename = `readpal-annotations-${new Date().toISOString().slice(0, 10)}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_ERROR', message: 'Failed to export CSV' },
    });
  }
});

export default router;
