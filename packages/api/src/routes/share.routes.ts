/**
 * Share Routes
 *
 * Generate shareable reading progress cards, public reading summaries,
 * and shareable export links.
 */

import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { notFound } from '../utils/errors';
import { Book, ReadingSession, Annotation, SharedExport } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { exportAnnotations } from '../services/ExportService';
import { Op } from 'sequelize';

const router: Router = Router();

/**
 * GET /api/share/reading-card
 *
 * Returns a structured reading progress card that can be rendered
 * as a shareable image or embedded card.
 */
router.get('/reading-card', authenticate, rateLimiter({ windowMs: 60000, max: 20 }), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const [books, totalSessions, totalAnnotations] = await Promise.all([
      Book.findAll({
        where: { userId },
        attributes: ['id', 'title', 'author', 'progress', 'status', 'totalPages', 'currentPage', 'coverUrl'],
        order: [['lastReadAt', 'DESC NULLS LAST']],
        limit: 3,
      }),
      ReadingSession.count({ where: { userId } }),
      Annotation.count({ where: { userId } }),
    ]);

    const completedBooks = books.filter((b) => b.status === 'completed').length;
    const currentlyReading = books.find((b) => b.status === 'reading');
    const totalPages = books.reduce((sum, b) => sum + Math.round((Number(b.progress) / 100) * b.totalPages), 0);

    const card = {
      user: {
        name: (req.user as { name?: string })?.name || 'Reader',
      },
      stats: {
        booksCompleted: completedBooks,
        totalBooks: await Book.count({ where: { userId } }),
        totalPages,
        sessions: totalSessions,
        highlights: totalAnnotations,
      },
      currentlyReading: currentlyReading
        ? {
            title: currentlyReading.title,
            author: currentlyReading.author,
            progress: Math.round(Number(currentlyReading.progress)),
          }
        : null,
      recentBooks: books.slice(0, 3).map((b) => ({
        title: b.title,
        author: b.author,
        progress: Math.round(Number(b.progress)),
      })),
      generatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: card });
  } catch (error) {
    console.error('Error generating reading card:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_CARD_ERROR', message: 'Failed to generate reading card' },
    });
  }
});

/**
 * GET /api/share/book/:id
 *
 * Returns a shareable summary for a specific book.
 */
router.get('/book/:id', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const book = await Book.findOne({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!book) {
      return notFound(res, 'Book');
    }

    const annotations = await Annotation.findAll({
      where: { bookId: book.id, userId: req.userId, type: 'highlight' },
      attributes: ['content'],
      limit: 5,
      order: [['createdAt', 'DESC']],
    });

    const summary = {
      book: {
        title: book.title,
        author: book.author,
        fileType: book.fileType,
        progress: Math.round(Number(book.progress)),
        totalPages: book.totalPages,
        status: book.status,
      },
      topHighlights: annotations.map((a) => a.content),
      completedAt: book.completedAt?.toISOString() || null,
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error sharing book:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_BOOK_ERROR', message: 'Failed to generate book share' },
    });
  }
});

// ---------------------------------------------------------------------------
// Shareable Export Links
// ---------------------------------------------------------------------------

/**
 * POST /api/share/export
 *
 * Generate a shareable link for an annotation export.
 * Returns the generated content + a public URL token.
 */
router.post('/export', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), async (req: AuthRequest, res) => {
  try {
    const { bookId, format, types, tags } = req.body as {
      bookId?: string;
      format?: string;
      types?: string;
      tags?: string;
    };

    if (!bookId || !format) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'bookId and format are required' },
      });
    }

    // Only allow formats that produce text content (not binary)
    const allowedFormats = ['markdown', 'json', 'bookclub', 'research'];
    if (!allowedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FORMAT', message: `Format must be one of: ${allowedFormats.join(', ')}` },
      });
    }

    const book = await Book.findOne({ where: { id: bookId, userId: req.userId } });
    if (!book) {
      return notFound(res, 'Book');
    }

    // Build annotation query
    const whereClause: Record<string, unknown> = { bookId, userId: req.userId };
    if (types) {
      const typeList = String(types).split(',').filter(Boolean);
      const validTypes = ['highlight', 'note', 'bookmark'];
      const invalidTypes = typeList.filter(t => !validTypes.includes(t));
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TYPES', message: `Invalid annotation types: ${invalidTypes.join(', ')}. Valid: ${validTypes.join(', ')}` },
        });
      }
      if (typeList.length > 0) {
        whereClause.type = typeList;
      }
    }
    if (tags) {
      const tagList = String(tags).split(',').filter(Boolean);
      if (tagList.length > 0) {
        whereClause.tags = { [Op.overlap]: tagList };
      }
    }

    const annotations = await Annotation.findAll({
      where: whereClause,
      order: [['createdAt', 'ASC']],
    });

    // Get reading stats
    const sessions = await ReadingSession.findAll({
      where: { bookId, userId: req.userId },
      attributes: ['duration', 'pagesRead', 'startedAt'],
    });
    const stats = sessions.length > 0 ? {
      sessionCount: sessions.length,
      totalReadingTime: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
      totalPagesRead: sessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0),
      firstReadAt: sessions[sessions.length - 1]?.startedAt,
      lastReadAt: sessions[0]?.startedAt,
    } : undefined;

    // For markdown and json, handle via annotation route logic
    let content: string;
    let contentType: string;

    if (format === 'json') {
      const data = annotations.map((a) => ({
        type: a.type,
        content: a.content,
        note: a.note,
        tags: a.tags,
        location: a.location,
        createdAt: a.createdAt,
      }));
      content = JSON.stringify({
        book: { title: book.title, author: book.author, progress: book.progress },
        stats: stats || null,
        annotations: data,
      }, null, 2);
      contentType = 'application/json';
    } else if (format === 'markdown') {
      const lines = [
        `# ${book.title}`,
        `**${book.author}**`,
        '',
      ];
      const highlights = annotations.filter((a) => a.type === 'highlight');
      const notes = annotations.filter((a) => a.type === 'note');

      if (highlights.length > 0) {
        lines.push(`## Highlights (${highlights.length})`, '');
        for (const h of highlights) {
          const page = (h.location as Record<string, unknown>)?.pageNumber
            ? ` (p. ${(h.location as Record<string, unknown>).pageNumber})`
            : (h.location as Record<string, unknown>)?.chapterIndex !== undefined && ((h.location as Record<string, unknown>).chapterIndex as number) >= 0
              ? ` (Ch. ${((h.location as Record<string, unknown>).chapterIndex as number) + 1})`
              : '';
          lines.push(`> ${h.content}${page}`);
          if (h.note) lines.push(`  — *${h.note}*`);
          lines.push('');
        }
      }

      if (notes.length > 0) {
        lines.push(`## Notes (${notes.length})`, '');
        for (const n of notes) {
          lines.push(`- ${n.content}`);
          if (n.note) lines.push(`  → ${n.note}`);
          lines.push('');
        }
      }

      content = lines.join('\n');
      contentType = 'text/markdown; charset=utf-8';
    } else {
      // bookclub or research — use ExportService
      const result = await exportAnnotations(
        format as 'bookclub' | 'research',
        { title: book.title, author: book.author, totalPages: book.totalPages, currentPage: book.currentPage, progress: Number(book.progress), metadata: book.metadata as Record<string, unknown> | undefined },
        annotations.map((a) => ({
          type: a.type,
          content: a.content,
          note: a.note ?? undefined,
          tags: a.tags ?? undefined,
          location: a.location as { pageNumber?: number; cfi?: string; chapterIndex?: number; [key: string]: unknown } | undefined,
          createdAt: a.createdAt,
        })),
        stats,
      );
      content = result.content;
      contentType = result.contentType;
    }

    // Generate unique token
    const token = randomBytes(8).toString('hex'); // 16-char hex token

    const shared = await SharedExport.create({
      userId: req.userId!,
      bookId,
      token,
      format,
      title: book.title,
      content,
      contentType,
    });

    res.json({
      success: true,
      data: {
        token: shared.token,
        url: `/share/${shared.token}`,
        format: shared.format,
        title: shared.title,
        createdAt: shared.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating shareable export:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_EXPORT_ERROR', message: 'Failed to create shareable link' },
    });
  }
});

/**
 * GET /api/share/s/:token
 *
 * Public endpoint — view a shared export. No authentication required.
 * Supports both JSON API and direct rendering via Accept header.
 */
router.get('/s/:token', rateLimiter({ windowMs: 60000, max: 60 }), async (req, res) => {
  try {
    const { token } = req.params;
    const shared = await SharedExport.findOne({ where: { token } });

    if (!shared) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'This share link does not exist or has expired' },
      });
    }

    // Check expiration
    if (shared.expiresAt && new Date() > shared.expiresAt) {
      return res.status(410).json({
        success: false,
        error: { code: 'EXPIRED', message: 'This share link has expired' },
      });
    }

    // Increment view count (fire and forget)
    SharedExport.update({ viewCount: shared.viewCount + 1 }, { where: { id: shared.id } }).catch(() => {});

    // If client wants JSON, return structured data
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) {
      return res.json({
        success: true,
        data: {
          title: shared.title,
          format: shared.format,
          content: shared.content,
          contentType: shared.contentType,
          viewCount: shared.viewCount + 1,
          createdAt: shared.createdAt,
        },
      });
    }

    // Otherwise render as HTML page
    const html = renderSharedExportHtml(shared.title, shared.content, shared.format, shared.createdAt);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error viewing shared export:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SHARE_VIEW_ERROR', message: 'Failed to load shared export' },
    });
  }
});

/**
 * DELETE /api/share/export/:token
 *
 * Revoke a shareable export link.
 */
router.delete('/export/:token', authenticate, async (req: AuthRequest, res) => {
  try {
    const shared = await SharedExport.findOne({
      where: { token: req.params.token, userId: req.userId },
    });

    if (!shared) {
      return notFound(res, 'Shared export');
    }

    await shared.destroy();
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting shared export:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: 'Failed to delete shared export' },
    });
  }
});

/**
 * GET /api/share/export/list
 *
 * List all shareable exports for the current user.
 */
router.get('/export/list', authenticate, async (req: AuthRequest, res) => {
  try {
    const exports = await SharedExport.findAll({
      where: { userId: req.userId },
      attributes: ['id', 'token', 'bookId', 'format', 'title', 'viewCount', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    res.json({
      success: true,
      data: exports.map((e) => ({
        id: e.id,
        token: e.token,
        url: `/share/${e.token}`,
        bookId: e.bookId,
        format: e.format,
        title: e.title,
        viewCount: e.viewCount,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error listing shared exports:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Failed to list shared exports' },
    });
  }
});

// ---------------------------------------------------------------------------
// HTML Rendering for shared exports
// ---------------------------------------------------------------------------

function renderSharedExportHtml(title: string, content: string, format: string, createdAt: Date): string {
  const isJson = format === 'json';
  const escapedTitle = escapeHtml(title);
  const escapedContent = isJson
    ? `<pre class="json">${escapeHtml(content)}</pre>`
    : renderMarkdownAsHtml(content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle} — read-pal Shared Export</title>
  <meta name="description" content="Shared reading annotations for ${escapedTitle}">
  <style>
    :root { --bg: #faf9f7; --surface: #fff; --text: #1a1a2e; --muted: #6b7280; --accent: #d97706; --border: #e5e7eb; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --surface: #1e293b; --text: #f1f5f9; --muted: #94a3b8; --accent: #f59e0b; --border: #334155; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; padding: 2rem 1rem; }
    .container { max-width: 720px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .brand { font-size: 0.8rem; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .meta { font-size: 0.85rem; color: var(--muted); }
    .content { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem 2rem; white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }
    .content h2 { font-size: 1.2rem; font-weight: 600; margin: 1.5rem 0 0.75rem; color: var(--accent); }
    .content h3 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.5rem; }
    .content blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; margin: 0.75rem 0; color: var(--muted); font-style: italic; }
    .content ul, .content ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .content li { margin: 0.25rem 0; }
    .content p { margin: 0.5rem 0; }
    .content strong { font-weight: 600; }
    .content em { font-style: italic; }
    .content code { background: var(--bg); padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
    .content pre.json { white-space: pre-wrap; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 0.8rem; }
    footer { text-align: center; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); }
    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <p class="brand">read-pal Shared Export</p>
      <h1>${escapedTitle}</h1>
      <p class="meta">Shared on ${createdAt.toLocaleDateString()}</p>
    </header>
    <div class="content">${escapedContent}</div>
    <footer>
      <p>Shared via <a href="/">read-pal</a> — AI Reading Companion</p>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal markdown-to-HTML renderer for shared exports */
function renderMarkdownAsHtml(md: string): string {
  let html = escapeHtml(md);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs — wrap loose text
  html = html.replace(/^(?!<[hbul]|<li|<block|<code|<strong|<em)(.*\S.*)$/gm, '<p>$1</p>');

  // Clean up excessive newlines
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

export default router;
