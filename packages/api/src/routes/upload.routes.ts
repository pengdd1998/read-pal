/**
 * File Upload Routes
 */

import { Router } from 'express';
import { notFound } from '../utils/errors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { Book, Document } from '../models';
import { BookProcessor } from '../services/BookProcessor';
import { ContentProcessor } from '../services/ContentProcessor';
import { SemanticSearch } from '../services/SemanticSearch';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { dispatchWebhook } from '../services/WebhookDelivery';

const router: Router = Router();
const processor = new BookProcessor();
const contentProcessor = new ContentProcessor();
const semanticSearch = new SemanticSearch();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/epub+zip',
      'application/pdf',
    ];

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.epub', '.pdf'];

    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only EPUB and PDF files are allowed'));
    }
  },
});

/**
 * Validate file magic bytes to ensure the file content matches the extension.
 * - PDF: starts with %PDF
 * - EPUB: starts with PK (ZIP archive, since EPUB is ZIP-based)
 */
function validateMagicBytes(buffer: Buffer, fileType: string): boolean {
  if (buffer.length < 4) return false;

  if (fileType === 'pdf') {
    // PDF files start with %PDF
    return buffer[0] === 0x25 && buffer[1] === 0x50 &&
           buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  if (fileType === 'epub') {
    // EPUB files are ZIP archives starting with PK (0x50 0x4B)
    return buffer[0] === 0x50 && buffer[1] === 0x4B;
  }

  return false;
}

/**
 * POST /api/upload
 * Upload and process a book file
 */
router.post('/', authenticate, rateLimiter({ windowMs: 60000, max: 10 }), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded',
        },
      });
    }

    const { title, author } = req.body;
    const file = req.file;
    const userId = req.userId!;

    // Determine file type
    const ext = path.extname(file.originalname).toLowerCase();
    const fileType = ext === '.epub' ? 'epub' : 'pdf';

    // Validate magic bytes to prevent disguised files
    if (!validateMagicBytes(file.buffer, fileType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE',
          message: `File content does not match expected ${fileType.toUpperCase()} format`,
        },
      });
    }

    // Create temp file path (sanitize filename to prevent path traversal)
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempPath = path.join(uploadDir, `${Date.now()}-${safeName}`);

    // Write buffer to temp file
    await fs.writeFile(tempPath, file.buffer);

    // Extract metadata from file — always try extraction for rich metadata
    let bookTitle = title || '';
    let bookAuthor = author || '';
    let totalPages = 0;
    let bookMetadata: Record<string, unknown> = {};

    try {
      const extracted = await processor.extractMetadata(tempPath, fileType);
      bookTitle = bookTitle || extracted.title || path.basename(file.originalname, ext).replace(/[-_]+/g, ' ').trim();
      bookAuthor = bookAuthor || extracted.author || 'Unknown Author';
      totalPages = extracted.totalPages || 0;

      // Store all extracted metadata in JSONB field
      const metaFields: Record<string, unknown> = {};
      if (extracted.publisher) metaFields.publisher = extracted.publisher;
      if (extracted.language) metaFields.language = extracted.language;
      if (extracted.description) metaFields.description = extracted.description;
      if (extracted.genres && extracted.genres.length > 0) metaFields.genre = extracted.genres;
      if (extracted.isbn) metaFields.isbn = extracted.isbn;
      if (extracted.publishedDate) metaFields.publishedDate = extracted.publishedDate;
      if (Object.keys(metaFields).length > 0) {
        bookMetadata = metaFields;
      }
    } catch (error) {
      console.error('Metadata extraction failed:', error);
      bookTitle = bookTitle || path.basename(file.originalname, ext).replace(/[-_]+/g, ' ').trim();
      bookAuthor = bookAuthor || 'Unknown Author';
    }

    // Create book record
    const book = await Book.create({
      userId,
      title: bookTitle,
      author: bookAuthor,
      fileType,
      fileSize: file.size,
      totalPages,
      currentPage: 0,
      progress: 0,
      addedAt: new Date(),
      status: 'unread',
      metadata: Object.keys(bookMetadata).length > 0 ? bookMetadata : undefined,
    });

    // Process content
    let content = '';
    let chapters: { id: string; title: string; content: string; startIndex: number; endIndex: number; order: number }[] = [];

    try {
      if (fileType === 'epub') {
        ({ content, chapters } = await processor.processEPUB(tempPath, book.id));
      } else {
        ({ content, chapters } = await processor.processPDF(file.buffer, book.id));
      }
    } catch (processError) {
      console.error('Content processing failed:', processError);
      // Clean up - delete the book record since content failed
      await book.destroy();
      try { await fs.unlink(tempPath); } catch {}
      return res.status(500).json({
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Failed to process book content. The file may be corrupted.',
        },
      });
    }

    // Save content
    await processor.saveContent(book.id, userId, content, chapters);

    // Background: advanced content processing + semantic indexing
    // Fire-and-forget so upload response isn't delayed
    setImmediate(async () => {
      try {
        const processed = contentProcessor.processPlainText(content, book.id, bookTitle, bookAuthor);

        const searchChunks = processed.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          chapterTitle: chunk.chapterTitle,
          startIndex: chunk.startOffset,
          endIndex: chunk.endOffset,
          order: chunk.chunkIndex,
        }));
        await semanticSearch.indexChunks(userId, book.id, searchChunks);
        console.log(`[ContentPipeline] Indexed ${searchChunks.length} chunks for book ${book.id}`);
      } catch (pipelineError) {
        console.warn('[ContentPipeline] Background processing skipped:', (pipelineError as Error).message);
      }
    });

    // Update book with chapter count
    book.totalPages = chapters.length;
    await book.save();

    // Clean up temp file
    await fs.unlink(tempPath);

    // Fire-and-forget webhook dispatch
    dispatchWebhook(userId, 'book.started', {
      bookId: book.id,
      title: book.title,
      author: book.author,
      fileType: book.fileType,
    }).catch((err) => { console.error('[Webhook] book.uploaded dispatch failed:', err); });

    res.json({
      success: true,
      data: {
        book: {
          id: book.id,
          title: book.title,
          author: book.author,
          fileType: book.fileType,
          totalPages: book.totalPages,
          status: book.status,
          progress: 0,
        },
        chaptersCount: chapters.length,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Failed to upload file',
      },
    });
  }
});

/**
 * GET /api/books/:id/content
 * Get book content for reading
 */
router.get('/books/:bookId/content', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.userId!;

    // Get book
    const book = await Book.findOne({
      where: { id: bookId, userId },
    });

    if (!book) {
      return notFound(res, 'Book');
    }

    // Get document
    const document = await Document.findOne({
      where: { bookId, userId },
    });

    if (!document) {
      return notFound(res, 'Book content');
    }

    // Content never changes after upload — cache for 1 hour
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({
      success: true,
      data: {
        book: {
          id: book.id,
          title: book.title,
          author: book.author,
          currentPage: book.currentPage,
          totalPages: document.chapters.length,
        },
        chapters: document.chapters,
        content: document.content,
      },
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CONTENT_ERROR',
        message: 'Failed to get book content',
      },
    });
  }
});

export default router;
