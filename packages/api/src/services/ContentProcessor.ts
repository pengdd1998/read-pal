/**
 * Content Processing Pipeline
 *
 * Handles ingestion of reading content: EPUB, PDF, and plain text.
 * Extracts text, chunks for vector search, identifies key concepts,
 * and prepares data for knowledge graph construction.
 */

import EPub from 'epub';
import pdf from 'pdf-parse';
import { createHash } from 'crypto';
import { decodeHTMLEntities } from '@read-pal/shared';

// ============================================================================
// Types
// ============================================================================

interface ProcessedContent {
  bookId: string;
  title: string;
  author: string;
  totalChunks: number;
  totalWords: number;
  chunks: TextChunk[];
  concepts: ExtractedConcept[];
  metadata: BookMetadata;
}

interface TextChunk {
  id: string;
  bookId: string;
  content: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  chapterTitle: string;
  wordCount: number;
  hash: string;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  chapterIndex: number;
  sectionIndex: number;
  isChapterStart: boolean;
  hasDialogue: boolean;
  avgSentenceLength: number;
  readabilityScore: number;
}

interface ExtractedConcept {
  text: string;
  type: 'term' | 'name' | 'place' | 'idea' | 'theory' | 'framework';
  confidence: number;
  firstOccurrence: number;
  frequency: number;
  context: string;
}

interface BookMetadata {
  title?: string;
  author?: string;
  publisher?: string;
  language?: string;
  pageCount?: number;
  wordCount?: number;
  estimatedReadingTime?: number; // minutes
  publishedDate?: string;
  isbn?: string;
  description?: string;
}

interface ProcessingOptions {
  chunkSize: number;           // target words per chunk
  chunkOverlap: number;        // overlapping words between chunks
  extractConcepts: boolean;
  maxConcepts: number;
  language: string;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  chunkSize: 500,
  chunkOverlap: 50,
  extractConcepts: true,
  maxConcepts: 100,
  language: 'en',
};

// ============================================================================
// Content Processor
// ============================================================================

export class ContentProcessor {
  private options: ProcessingOptions;

  constructor(options?: Partial<ProcessingOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process an EPUB file
   */
  async processEPUB(filePath: string, bookId: string): Promise<ProcessedContent> {
    return new Promise((resolve, reject) => {
      const epub = new EPub(filePath);

      epub.on('error', reject);

      epub.on('end', () => {
        const metadata: BookMetadata = {
          title: epub.metadata?.title as string | undefined,
          author: epub.metadata?.creator as string | undefined,
          language: epub.metadata?.language as string | undefined,
          publisher: epub.metadata?.publisher as string | undefined,
          publishedDate: epub.metadata?.date as string | undefined,
        };

        const chapters: { title: string; content: string }[] = [];
        const spine = epub.spine || [];
        let chapterIndex = 0;

        const processNext = (idx: number) => {
          if (idx >= spine.length) {
            // All chapters collected, now process
            const fullText = chapters.map(c => c.content).join('\n\n');
            const result = this.processText(fullText, bookId, chapters, metadata);
            resolve(result);
            return;
          }

          const item = spine[idx];
          epub.getChapter(item.id || '', (err: Error | null, text: string | null) => {
            if (!err && text) {
              const cleanText = this.cleanHTML(text);
              if (cleanText.trim()) {
                chapters.push({
                  title: item.title || `Chapter ${chapterIndex + 1}`,
                  content: cleanText,
                });
                chapterIndex++;
              }
            }
            processNext(idx + 1);
          });
        };

        processNext(0);
      });

      epub.parse();
    });
  }

  /**
   * Process a PDF file
   */
  async processPDF(buffer: Buffer, bookId: string): Promise<ProcessedContent> {
    const data = await pdf(buffer);
    const fullText = data.text;

    const metadata: BookMetadata = {
      title: data.info?.Title,
      author: data.info?.Author,
      pageCount: data.numpages,
    };

    // Split by pages for chapter context
    const pages = fullText.split('\f');
    const chapters = pages
      .filter(p => p.trim())
      .map((content, i) => ({
        title: `Page ${i + 1}`,
        content: content.trim(),
      }));

    return this.processText(fullText, bookId, chapters, metadata);
  }

  /**
   * Process plain text content
   */
  processPlainText(text: string, bookId: string, title?: string, author?: string): ProcessedContent {
    const metadata: BookMetadata = { title, author };
    const chapters = text.split(/\n{2,}/).filter(Boolean).map((content, i) => ({
      title: `Section ${i + 1}`,
      content: content.trim(),
    }));

    return this.processText(text, bookId, chapters, metadata);
  }

  /**
   * Core processing: chunk text, extract concepts, compute stats
   */
  private processText(
    fullText: string,
    bookId: string,
    chapters: { title: string; content: string }[],
    metadata: BookMetadata
  ): ProcessedContent {
    // 1. Chunk the text
    const chunks = this.chunkText(fullText, bookId, chapters);

    // 2. Extract concepts
    const concepts = this.options.extractConcepts
      ? this.extractConceptsFromText(fullText)
      : [];

    // 3. Compute stats
    const totalWords = this.countWords(fullText);
    const estimatedReadingTime = Math.ceil(totalWords / 250); // 250 WPM average

    return {
      bookId,
      title: metadata.title || 'Untitled',
      author: metadata.author || 'Unknown',
      totalChunks: chunks.length,
      totalWords,
      chunks,
      concepts: concepts.slice(0, this.options.maxConcepts),
      metadata: {
        ...metadata,
        wordCount: totalWords,
        estimatedReadingTime,
      },
    };
  }

  /**
   * Split text into overlapping chunks at paragraph boundaries
   */
  private chunkText(
    fullText: string,
    bookId: string,
    chapters: { title: string; content: string }[]
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = fullText.split(/\n{2,}/).filter(p => p.trim());

    let currentChunk = '';
    let currentWordCount = 0;
    let chunkIndex = 0;
    let globalOffset = 0;
    let chapterTitle = chapters[0]?.title || 'Chapter 1';
    let chapterContentIndex = 0;
    let sectionIndex = 0;

    for (const paragraph of paragraphs) {
      const paraWords = this.countWords(paragraph);

      // Update chapter context
      if (chapters.length > 0) {
        for (let i = chapterContentIndex; i < chapters.length; i++) {
          if (globalOffset >= fullText.indexOf(chapters[i].content, globalOffset - 100)) {
            chapterTitle = chapters[i].title;
            chapterContentIndex = i;
            sectionIndex = 0;
          }
        }
      }

      // If adding this paragraph exceeds chunk size, finalize current chunk
      if (currentWordCount + paraWords > this.options.chunkSize && currentWordCount > 0) {
        chunks.push(this.createChunk(
          currentChunk.trim(),
          bookId,
          chunkIndex,
          globalOffset - currentChunk.length,
          globalOffset,
          chapterTitle,
          sectionIndex,
          chunks.length === 0
        ));
        sectionIndex++;
        chunkIndex++;

        // Keep overlap
        const overlapText = this.getOverlapText(currentChunk, this.options.chunkOverlap);
        currentChunk = overlapText + '\n\n' + paragraph;
        currentWordCount = this.countWords(currentChunk);
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentWordCount += paraWords;
      }

      globalOffset += paragraph.length + 2;
    }

    // Final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        bookId,
        chunkIndex,
        globalOffset - currentChunk.length,
        globalOffset,
        chapterTitle,
        sectionIndex,
        chunks.length === 0
      ));
    }

    return chunks;
  }

  /**
   * Create a text chunk with computed metadata
   */
  private createChunk(
    content: string,
    bookId: string,
    chunkIndex: number,
    startOffset: number,
    endOffset: number,
    chapterTitle: string,
    sectionIndex: number,
    isChapterStart: boolean
  ): TextChunk {
    const wordCount = this.countWords(content);
    return {
      id: `${bookId}-chunk-${chunkIndex}`,
      bookId,
      content,
      chunkIndex,
      startOffset: Math.max(0, startOffset),
      endOffset,
      chapterTitle,
      wordCount,
      hash: createHash('sha256').update(content).digest('hex').substring(0, 16),
      metadata: {
        chapterIndex: 0,
        sectionIndex,
        isChapterStart,
        hasDialogue: /\s"[^"]+["']/.test(content) || /\s'[^']+'/.test(content),
        avgSentenceLength: this.avgSentenceLength(content),
        readabilityScore: this.fleschKincaid(content),
      },
    };
  }

  /**
   * Extract key concepts from text using heuristics
   * (In production, this would use Claude API for better extraction)
   */
  private extractConceptsFromText(text: string): ExtractedConcept[] {
    const concepts: Map<string, ExtractedConcept> = new Map();

    // Capitalized multi-word phrases (potential named entities/concepts)
    const phraseRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match;
    while ((match = phraseRegex.exec(text)) !== null) {
      const conceptText = match[1];
      if (conceptText.length < 4 || conceptText.length > 60) continue;

      // Filter common false positives
      const stopPhrases = ['In The', 'Of The', 'For The', 'To The', 'And The', 'With The', 'On The', 'It Was', 'He Was', 'She Was', 'They Were', 'At The', 'By The'];
      if (stopPhrases.some(p => conceptText === p)) continue;

      const existing = concepts.get(conceptText);
      if (existing) {
        existing.frequency++;
      } else {
        const startIdx = match.index;
        const contextStart = Math.max(0, startIdx - 50);
        const contextEnd = Math.min(text.length, startIdx + conceptText.length + 50);
        concepts.set(conceptText, {
          text: conceptText,
          type: this.classifyConcept(conceptText),
          confidence: 0.7,
          firstOccurrence: startIdx,
          frequency: 1,
          context: text.substring(contextStart, contextEnd).trim(),
        });
      }
    }

    // Quoted terms (often important concepts)
    const quotedRegex = /["']([A-Z][^"']{3,40})["']/g;
    while ((match = quotedRegex.exec(text)) !== null) {
      const conceptText = match[1];
      const existing = concepts.get(conceptText);
      if (existing) {
        existing.frequency++;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        concepts.set(conceptText, {
          text: conceptText,
          type: 'idea',
          confidence: 0.85,
          firstOccurrence: match.index,
          frequency: 1,
          context: text.substring(Math.max(0, match.index - 30), match.index + conceptText.length + 40).trim(),
        });
      }
    }

    // Sort by frequency and confidence
    return Array.from(concepts.values())
      .sort((a, b) => (b.frequency * b.confidence) - (a.frequency * a.confidence));
  }

  /**
   * Classify a concept by type based on heuristics
   */
  private classifyConcept(text: string): ExtractedConcept['type'] {
    const lower = text.toLowerCase();

    // Theory/framework patterns
    if (lower.includes('theory') || lower.includes('law') || lower.includes('principle') ||
        lower.includes('effect') || lower.includes('paradox') || lower.includes('framework')) {
      return 'theory';
    }

    // Name patterns (2-3 words, common name patterns)
    const words = text.split(' ');
    if (words.length === 2 || words.length === 3) {
      return 'name';
    }

    return 'term';
  }

  // ============================================================================
  // Text Utilities
  // ============================================================================

  private cleanHTML(html: string): string {
    return decodeHTMLEntities(
      html
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, ''),
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  private getOverlapText(text: string, overlapWords: number): string {
    const words = text.split(/\s+/);
    if (words.length <= overlapWords) return text;
    return words.slice(-overlapWords).join(' ');
  }

  private avgSentenceLength(text: string): number {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length === 0) return 0;
    const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).filter(w => w).length, 0);
    return Math.round(totalWords / sentences.length);
  }

  private fleschKincaid(text: string): number {
    const words = this.countWords(text);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length || 1;
    const syllables = text.split(/\s+/).reduce((sum, word) => sum + this.countSyllables(word), 0);

    if (words === 0) return 0;
    return Math.round(
      (206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)) * 10
    ) / 10;
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !prevVowel) count++;
      prevVowel = isVowel;
    }

    if (word.endsWith('e')) count--;
    return Math.max(1, count);
  }
}
