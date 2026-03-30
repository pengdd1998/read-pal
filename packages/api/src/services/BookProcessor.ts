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

      epub.on('end', () => {
        const spine = epub.spine || [];
        const chapters: Chapter[] = [];
        let fullContent = '';
        let chapterOrder = 0;

        // Process each chapter
        const processChapter = (index: number) => {
          if (index >= spine.length) {
            resolve({
              content: fullContent,
              chapters,
            });
            return;
          }

          const item = spine[index];
          epub.getChapter(item.id || '', (error, text) => {
            if (error) {
              processChapter(index + 1);
              return;
            }

            // Clean up HTML
            const cleanText = this.cleanHTML(text);

            if (cleanText.trim()) {
              const chapter: Chapter = {
                id: `${bookId}-ch-${chapterOrder}`,
                title: item.title || `Chapter ${chapterOrder + 1}`,
                content: cleanText,
                startIndex: fullContent.length,
                endIndex: fullContent.length + cleanText.length,
                order: chapterOrder,
              };

              chapters.push(chapter);
              fullContent += cleanText + '\n\n';
              chapterOrder++;
            }

            processChapter(index + 1);
          });
        };

        processChapter(0);
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
        resolve({
          title: epub.metadata.title,
          author: epub.metadata.creator,
          totalPages: (epub.spine || []).length,
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
