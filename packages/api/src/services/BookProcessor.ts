/**
 * Book Processing Service
 * Handles EPUB and PDF parsing, text extraction, and content storage
 */

import EPub from 'epub';
import pdf from 'pdf-parse';
import { Document, Chapter } from '../models';

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
   * Clean HTML and extract text
   */
  private cleanHTML(html: string): string {
    return html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    totalPages?: number;
  }> {
    if (fileType === 'epub') {
      return this.extractEPUBMetadata(filePath);
    }
    return this.extractPDFMetadata(filePath);
  }

  /**
   * Extract EPUB metadata
   */
  private async extractEPUBMetadata(filePath: string): Promise<{
    title?: string;
    author?: string;
    totalPages?: number;
  }> {
    return new Promise((resolve, reject) => {
      const epub = new EPub(filePath);

      epub.on('error', () => resolve({}));

      epub.on('end', () => {
        const contents = (epub as any).contents || [];
        resolve({
          title: epub.metadata.title,
          author: epub.metadata.creator,
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
    totalPages?: number;
  }> {
    // Basic implementation - would need pdfinfo or similar for full metadata
    return {};
  }
}
