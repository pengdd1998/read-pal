/**
 * ExportService — Format-specific annotation export generators
 *
 * Supports: bookclub, bibtex, apa, mla, chicago, research
 * Book club format uses GLM to generate discussion questions.
 */

import { chatCompletion } from './llmClient';
import type { BookMetadata } from '@read-pal/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnnotationData {
  type: 'highlight' | 'note' | 'bookmark';
  content: string;
  note?: string;
  color?: string;
  tags?: string[];
  location?: { pageNumber?: number; cfi?: string; chapterIndex?: number; [key: string]: unknown };
  createdAt?: Date;
}

interface BookInfo {
  title: string;
  author: string;
  metadata?: Record<string, unknown>;
}

export type ExportFormat = 'bookclub' | 'bibtex' | 'apa' | 'mla' | 'chicago' | 'research';

export interface ExportResult {
  content: string;
  contentType: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([#*_`~\[\]])/g, '\\$1');
}

function escapeLatex(text: string): string {
  return text.replace(/([&%$#_{}~^\\])/g, '\\$1');
}

function getMeta(book: BookInfo): BookMetadata {
  return (book.metadata as BookMetadata) || {};
}

function getYear(book: BookInfo): string {
  const meta = getMeta(book);
  if (meta.publishYear) return String(meta.publishYear);
  return 'n.d.';
}

/** Group annotations by tag */
function groupByTag(annotations: AnnotationData[]): Map<string, AnnotationData[]> {
  const map = new Map<string, AnnotationData[]>();
  for (const a of annotations) {
    const tags = a.tags && a.tags.length > 0 ? a.tags : ['untagged'];
    for (const t of tags) {
      const list = map.get(t) || [];
      list.push(a);
      map.set(t, list);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Book Club Summary
// ---------------------------------------------------------------------------

async function generateBookClub(
  book: BookInfo,
  annotations: AnnotationData[],
): Promise<ExportResult> {
  const highlights = annotations.filter((a) => a.type === 'highlight');
  const notes = annotations.filter((a) => a.type === 'note');
  const tagged = highlights.filter((a) => a.tags && a.tags.length > 0);
  const sortedHighlights = tagged.length > 0
    ? [...tagged, ...highlights.filter((a) => !a.tags || a.tags.length === 0)]
    : highlights;

  const lines: string[] = [
    `# ${escapeMarkdown(book.title)}`,
    `**${escapeMarkdown(book.author)}**`,
    '',
    `_Book Club Discussion Guide — ${new Date().toLocaleDateString()}_`,
    '',
  ];

  // Themes
  const tagGroups = groupByTag(annotations);
  if (tagGroups.size > 0) {
    lines.push('## Themes', '');
    for (const [tag, items] of tagGroups) {
      lines.push(`- **${escapeMarkdown(tag)}** (${items.length} annotation${items.length > 1 ? 's' : ''})`);
    }
    lines.push('');
  }

  // Top highlights
  if (sortedHighlights.length > 0) {
    lines.push(`## Key Highlights (${highlights.length})`, '');
    const top = sortedHighlights.slice(0, 20);
    for (const h of top) {
      const page = h.location?.pageNumber ? ` (p. ${h.location.pageNumber})` : '';
      lines.push(`> ${escapeMarkdown(h.content)}${page}`);
      if (h.note) lines.push(`  — *${escapeMarkdown(h.note)}*`);
      if (h.tags && h.tags.length > 0) {
        lines.push(`  Tags: ${h.tags.map((t) => `\`${t}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  // Notes
  if (notes.length > 0) {
    lines.push(`## Notes (${notes.length})`, '');
    for (const n of notes.slice(0, 15)) {
      lines.push(`### ${escapeMarkdown(n.content.slice(0, 80))}${n.content.length > 80 ? '...' : ''}`);
      if (n.note) lines.push('', escapeMarkdown(n.note));
      lines.push('');
    }
  }

  // AI discussion questions
  if (highlights.length > 0) {
    lines.push('## Discussion Questions', '');
    try {
      const questions = await generateDiscussionQuestions(book, highlights);
      for (let i = 0; i < questions.length; i++) {
        lines.push(`${i + 1}. ${questions[i]}`, '');
      }
    } catch {
      lines.push('_AI-generated questions unavailable — generate your own from the highlights above._', '');
    }
  }

  if (annotations.length === 0) {
    lines.push('_No annotations yet._');
  }

  return {
    content: lines.join('\n'),
    contentType: 'text/markdown; charset=utf-8',
    filename: `bookclub-${slugify(book.title)}.md`,
  };
}

async function generateDiscussionQuestions(
  book: BookInfo,
  highlights: AnnotationData[],
): Promise<string[]> {
  const excerpts = highlights.slice(0, 10).map((h) => h.content).join('\n---\n');
  const prompt = `Generate 5 thought-provoking discussion questions for a book club reading "${book.title}" by ${book.author}.

Key passages highlighted by the reader:
${excerpts}

Return ONLY a JSON array of 5 question strings. No explanation, no markdown.`;

  const raw = await chatCompletion({
    system: 'You are a book club discussion facilitator. Generate thought-provoking questions.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    maxTokens: 500,
  });

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, 5).map(String);
  } catch { /* try to extract from text */ }
  // Fallback: split by newlines, filter numbered items
  return raw.split('\n').filter((l) => l.trim().match(/^\d+\./)).map((l) => l.replace(/^\d+\.\s*/, '').trim()).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Citation Formats
// ---------------------------------------------------------------------------

function generateBibtex(book: BookInfo, _annotations: AnnotationData[]): ExportResult {
  const meta = getMeta(book);
  const year = getYear(book);
  const key = slugify(book.author.split(',')[0] || book.author) + year;
  const isbn = meta.isbn || '';
  const publisher = meta.publisher || '';
  const lines = [
    `@book{${key},`,
    `  title={${book.title}}`,
    `  author={${book.author}}`,
    `  year={${year}}`,
  ];
  if (publisher) lines.push(`  publisher={${publisher}}`);
  if (isbn) lines.push(`  isbn={${isbn}}`);
  lines.push('}');

  return {
    content: lines.join(',\n'),
    contentType: 'application/x-bibtex; charset=utf-8',
    filename: `${key}.bib`,
  };
}

function generateApa(book: BookInfo, _annotations: AnnotationData[]): ExportResult {
  const meta = getMeta(book);
  const year = getYear(book);
  const publisher = meta.publisher ? ` ${meta.publisher}.` : '';
  const citation = `${book.author} (${year}). *${book.title}*.${publisher}`;

  return {
    content: citation,
    contentType: 'text/plain; charset=utf-8',
    filename: `citation-${slugify(book.title)}-apa.txt`,
  };
}

function generateMla(book: BookInfo, _annotations: AnnotationData[]): ExportResult {
  const meta = getMeta(book);
  const year = getYear(book);
  const publisher = meta.publisher ? ` ${meta.publisher},` : '';
  const citation = `${book.author}. *${book.title}*.${publisher} ${year}.`;

  return {
    content: citation,
    contentType: 'text/plain; charset=utf-8',
    filename: `citation-${slugify(book.title)}-mla.txt`,
  };
}

function generateChicago(book: BookInfo, _annotations: AnnotationData[]): ExportResult {
  const meta = getMeta(book);
  const year = getYear(book);
  const publisher = meta.publisher ? ` ${meta.publisher},` : '';
  const loc = publisher ? '' : '';
  const citation = `${book.author}. *${book.title}*.${publisher} ${year}.`;

  return {
    content: citation,
    contentType: 'text/plain; charset=utf-8',
    filename: `citation-${slugify(book.title)}-chicago.txt`,
  };
}

// ---------------------------------------------------------------------------
// Research Notes
// ---------------------------------------------------------------------------

function generateResearch(book: BookInfo, annotations: AnnotationData[]): ExportResult {
  const lines: string[] = [
    `# Research Notes: ${escapeMarkdown(book.title)}`,
    `**Author:** ${escapeMarkdown(book.author)}`,
  ];

  const meta = getMeta(book);
  if (meta.isbn) lines.push(`**ISBN:** ${meta.isbn}`);
  if (meta.publishYear) lines.push(`**Year:** ${meta.publishYear}`);
  if (meta.publisher) lines.push(`**Publisher:** ${meta.publisher}`);

  lines.push('', `_Compiled ${new Date().toLocaleDateString()}_`, '');

  const tagGroups = groupByTag(annotations);

  if (tagGroups.size > 0) {
    for (const [tag, items] of tagGroups) {
      lines.push(`## ${escapeMarkdown(tag)} (${items.length})`, '');
      for (const a of items) {
        const page = a.location?.pageNumber ? ` (p. ${a.location.pageNumber})` : '';
        if (a.type === 'highlight') {
          lines.push(`> ${escapeMarkdown(a.content)}${page}`);
        } else if (a.type === 'note') {
          lines.push(`**Note:** ${escapeMarkdown(a.content)}${page}`);
        } else {
          lines.push(`- ${escapeMarkdown(a.content)}${page}`);
        }
        if (a.note) lines.push(`  → ${escapeMarkdown(a.note)}`);
        lines.push('');
      }
    }
  } else if (annotations.length > 0) {
    lines.push('## Annotations', '');
    for (const a of annotations) {
      const page = a.location?.pageNumber ? ` (p. ${a.location.pageNumber})` : '';
      lines.push(`- [${a.type}] ${escapeMarkdown(a.content)}${page}`);
      if (a.note) lines.push(`  → ${escapeMarkdown(a.note)}`);
      lines.push('');
    }
  } else {
    lines.push('_No annotations yet._');
  }

  return {
    content: lines.join('\n'),
    contentType: 'text/markdown; charset=utf-8',
    filename: `research-${slugify(book.title)}.md`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function exportAnnotations(
  format: ExportFormat,
  book: BookInfo,
  annotations: AnnotationData[],
): Promise<ExportResult> {
  switch (format) {
    case 'bookclub':
      return generateBookClub(book, annotations);
    case 'bibtex':
      return generateBibtex(book, annotations);
    case 'apa':
      return generateApa(book, annotations);
    case 'mla':
      return generateMla(book, annotations);
    case 'chicago':
      return generateChicago(book, annotations);
    case 'research':
      return generateResearch(book, annotations);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
