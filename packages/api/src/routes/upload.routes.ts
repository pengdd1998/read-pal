/**
 * File Upload Routes
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { Book, Document } from '../models';
import { BookProcessor } from '../services/BookProcessor';
import { ContentProcessor } from '../services/ContentProcessor';
import { SemanticSearch } from '../services/SemanticSearch';
import { authenticate, AuthRequest } from '../middleware/auth';

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
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/epub+zip',
      'application/pdf',
      'application/octet-stream', // EPUB often has this type
    ];

    // Also check file extension
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
 * POST /api/upload
 * Upload and process a book file
 */
router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
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

    // Create temp file path
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const tempPath = path.join(uploadDir, `${Date.now()}-${file.originalname}`);

    // Write buffer to temp file
    await fs.writeFile(tempPath, file.buffer);

    // Extract metadata if not provided
    let bookTitle = title;
    let bookAuthor = author;
    let totalPages = 0;

    if (!title || !author) {
      try {
        const metadata = await processor.extractMetadata(tempPath, fileType);
        bookTitle = bookTitle || metadata.title || path.basename(file.originalname, ext);
        bookAuthor = bookAuthor || metadata.author || 'Unknown Author';
        totalPages = metadata.totalPages || 0;
      } catch (error) {
        console.error('Metadata extraction failed:', error);
        bookTitle = bookTitle || path.basename(file.originalname, ext);
        bookAuthor = bookAuthor || 'Unknown Author';
      }
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
    });

    // Process content
    let content = '';
    let chapters: any[] = [];

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
        message: error instanceof Error ? error.message : 'Failed to upload file',
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOK_NOT_FOUND',
          message: 'Book not found',
        },
      });
    }

    // Get document
    const document = await Document.findOne({
      where: { bookId, userId },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONTENT_NOT_FOUND',
          message: 'Book content not found',
        },
      });
    }

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
