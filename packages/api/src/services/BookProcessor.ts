/**
 * Book Processing Service
 * Handles EPUB and PDF parsing, text extraction, and content storage
 */

import EPub from 'epub';
import pdf from 'pdf-parse';
import { Document, Chapter } from '../models';
import { decodeHTMLEntities } from '@read-pal/shared';

export class BookProcessor {
  /**
   * Process EPUB file
   */
  async processEPUB(filePath: string, bookId: string): Promise<{
    content: string;
    chapters: Chapter[];
  }> {
    return new Promise((resolve, reject) => {
      const epub = new EPub(filePath);

      epub.on('error', reject);

      epub.on('end', async () => {
        try {
          // epub.flow is the array of chapter items with id, href, title
          const items = ((epub as unknown as Record<string, unknown>).flow || []) as { id?: string; href?: string; title?: string }[];
          const chapters: Chapter[] = [];
          let fullContent = '';

          for (const item of items) {
            if (!item?.id) continue;

            // Get chapter content - skip on error
            let text = '';
            try {
              text = await new Promise<string>((res, rej) => {
                epub.getChapter(item.id || '', (err: Error | null, data: string | null) => {
                  if (err) {
                    rej(err);
                    return;
                  }
                  res(data || '');
                });
              });
            } catch {
              // Skip chapters that fail to extract
              continue;
            }

            const cleanText = this.cleanHTML(text);
            if (cleanText.trim()) {
              const chapter: Chapter = {
                id: `${bookId}-ch-${chapters.length}`,
                title: item.title || `Chapter ${chapters.length + 1}`,
                content: cleanText,
                rawContent: this.sanitizeHTML(text),
                startIndex: fullContent.length,
                endIndex: fullContent.length + cleanText.length,
                order: chapters.length,
              };

              chapters.push(chapter);
              fullContent += cleanText + '\n\n';
            }
          }

          resolve({
            content: fullContent,
            chapters,
          });
        } catch (error) {
          reject(error);
        }
      });

      epub.parse();
    });
  }

  /**
   * Process PDF file
   */
  async processPDF(buffer: Buffer, bookId: string): Promise<{
    content: string;
    chapters: Chapter[];
  }> {
    try {
      const data = await pdf(buffer);
      const content = data.text;

      // Split into chapters (by page for now)
      const chapters: Chapter[] = [];
      const pages = content.split('\f'); // Form feed character

      let currentIndex = 0;
      pages.forEach((pageText, index) => {
        if (pageText.trim()) {
          chapters.push({
            id: `${bookId}-page-${index}`,
            title: `Page ${index + 1}`,
            content: pageText.trim(),
            startIndex: currentIndex,
            endIndex: currentIndex + pageText.length,
            order: index,
          });
          currentIndex += pageText.length;
        }
      });

      return {
        content,
        chapters,
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error}`);
    }
  }

  /**
   * Clean HTML for text extraction while preserving meaningful structure.
   * Uses a whitelist approach: structural elements (pre, code, table, blockquote,
   * headings, lists) are converted to readable text with formatting cues,
   * while all other tags are stripped.
   */
  private cleanHTML(html: string): string {
    // Remove script and style blocks entirely
    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '');

    // Preserve code blocks — convert <pre><code> to indented text
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, content: string) => {
      const inner = content.replace(/<code[^>]*>|<\/code>/gi, '').replace(/<br\s*\/?>/gi, '\n');
      const decoded = decodeHTMLEntities(inner);
      return '\n' + decoded.split('\n').map((line: string) => '    ' + line).join('\n') + '\n';
    });

    // Preserve inline code
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, content: string) => {
      return '`' + decodeHTMLEntities(content) + '`';
    });

    // Preserve tables — simple text rendering
    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, content: string) => {
      const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      return rows.map((row: string) => {
        const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
        return cells.map((cell: string) => cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).join(' | ');
      }).join('\n') + '\n';
    });

    // Preserve blockquotes
    text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, content: string) => {
      const inner = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return '\n> ' + inner + '\n';
    });

    // Preserve headings
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, content: string) => {
      const inner = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const prefix = '#'.repeat(parseInt(level));
      return `\n${prefix} ${inner}\n`;
    });

    // Preserve list items
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content: string) => {
      const inner = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return '\n• ' + inner;
    });

    // Line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');

    // Strip all remaining tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace while preserving intentional line breaks
    text = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  }

  /**
   * Sanitize HTML for safe rendering while preserving technical formatting.
   * Removes dangerous elements (scripts, styles, event handlers) but keeps
   * structural elements: pre, code, table, img, svg, figure, blockquote,
   * headings, lists, links, strong, em, etc.
   */
  private sanitizeHTML(html: string): string {
    // Remove script and style blocks entirely
    let sanitized = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '');

    // Remove event handlers (onclick, onload, onerror, etc.)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"');

    // Normalize self-closing img tags
    sanitized = sanitized.replace(/<img([^>]*?)(?!\/)>/gi, '<img$1 />');

    // Clean up excessive whitespace but preserve structure
    sanitized = sanitized.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

    return sanitized;
  }


  /**
   * Save processed content to database
   */
  async saveContent(
    bookId: string,
    userId: string,
    content: string,
    chapters: Chapter[]
  ): Promise<Document> {
    return await Document.create({
      bookId,
      userId,
      content,
      chapters,
    });
  }

  /**
   * Extract metadata from file
   */
  async extractMetadata(filePath: string, fileType: 'epub' | 'pdf'): Promise<{
    title?: string;
    author?: string;
    publisher?: string;
    language?: string;
    description?: string;
    genres?: string[];
    isbn?: string;
    publishedDate?: string;
    totalPages?: number;
  }> {
    if (fileType === 'epub') {
      return this.extractEPUBMetadata(filePath);
    }
    return this.extractPDFMetadata(filePath);
  }

  /**
   * Extract EPUB metadata from OPF package document.
   * Genre/subjects are extracted from `<dc:subject>` elements and stored
   * as `genres` so the genre-aware AI companion can use them.
   */
  private async extractEPUBMetadata(filePath: string): Promise<{
    title?: string;
    author?: string;
    publisher?: string;
    language?: string;
    description?: string;
    genres?: string[];
    isbn?: string;
    publishedDate?: string;
    totalPages?: number;
  }> {
    return new Promise((resolve, reject) => {
      const epub = new EPub(filePath);

      epub.on('error', () => resolve({}));

      epub.on('end', () => {
        const contents = (epub as unknown as { contents?: unknown[] }).contents || [];
        const meta = epub.metadata || {};

        // Extract ISBN from EPUB identifiers
        let isbn: string | undefined;
        const identifiers = (epub as unknown as { metadata?: { identifiers?: Array<{ id?: string; value?: string }> } }).metadata?.identifiers;
        if (Array.isArray(identifiers)) {
          const isbnEntry = identifiers.find((id) =>
            id.id?.toLowerCase().includes('isbn') || id.value?.match(/^[\d-]{10,17}$/),
          );
          if (isbnEntry) isbn = isbnEntry.value;
        }

        // Extract genres from dc:subject — EPUBs may have a single string
        // (comma or semicolon separated) or already be an array
        let genres: string[] | undefined;
        const rawSubject = meta.subject as string | string[] | undefined;
        if (rawSubject) {
          const subjects = Array.isArray(rawSubject)
            ? rawSubject
            : rawSubject.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          if (subjects.length > 0) genres = subjects;
        }

        resolve({
          title: (meta.title as string) || undefined,
          author: (meta.creator as string) || undefined,
          publisher: (meta.publisher as string) || undefined,
          language: (meta.language as string) || undefined,
          description: (meta.description as string) || undefined,
          genres,
          isbn,
          publishedDate: (meta.date as string) || undefined,
          totalPages: contents.length,
        });
      });

      epub.parse();
    });
  }

  /**
   * Extract PDF metadata
   */
  private async extractPDFMetadata(filePath: string): Promise<{
    title?: string;
    author?: string;
    publisher?: string;
    totalPages?: number;
  }> {
    try {
      const data = await pdf(await import('fs/promises').then((f) => f.readFile(filePath)));
      return {
        title: data.info?.Title || undefined,
        author: data.info?.Author || undefined,
        publisher: data.info?.Producer || undefined,
        totalPages: data.numpages || undefined,
      };
    } catch {
      return {};
    }
  }
}
