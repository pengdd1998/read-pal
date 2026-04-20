/**
 * Discussion Guide Export
 *
 * Generates a polished HTML discussion guide from annotations and book metadata.
 * Output can be copied, downloaded as HTML, or printed to PDF via window.print().
 */

import type { Annotation } from '@read-pal/shared';

interface BookMeta {
  title: string;
  author: string;
  totalPages?: number;
  currentPage?: number;
  progress?: number;
  coverUrl?: string;
}

interface ReadingStats {
  totalPages?: number;
  currentPage?: number;
  progress?: number;
  totalAnnotations?: number;
  highlights?: number;
  notes?: number;
  bookmarks?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Group annotations by tag, sorted by frequency */
function groupAnnotationsByTag(
  annotations: Annotation[],
): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const tags = a.tags && a.tags.length > 0 ? a.tags : ['untagged'];
    for (const t of tags) {
      const list = map.get(t) || [];
      list.push(a);
      map.set(t, list);
    }
  }
  // Sort by count descending
  return new Map([...map.entries()].sort(([, a], [, b]) => b.length - a.length));
}

/** Build the key themes section */
function renderThemes(annotations: Annotation[]): string {
  const groups = groupAnnotationsByTag(annotations);
  if (groups.size === 0) return '';

  const items = Array.from(groups.entries())
    .slice(0, 8)
    .map(
      ([tag, items]) =>
        `<li><strong>${escapeHtml(tag)}</strong> <span class="count">(${items.length})</span></li>`,
    )
    .join('\n');

  return `
    <section>
      <h2>Key Themes</h2>
      <ul class="themes">${items}</ul>
    </section>`;
}

/** Build notable quotes section from highlights */
function renderQuotes(annotations: Annotation[]): string {
  const highlights = annotations.filter((a) => a.type === 'highlight');
  if (highlights.length === 0) return '';

  const items = highlights
    .slice(0, 25)
    .map((h) => {
      const page = h.location?.pageIndex != null
        ? `<span class="ref">p. ${h.location.pageIndex! + 1}</span>`
        : '';
      const noteHtml = h.note
        ? `<div class="quote-note">${escapeHtml(h.note)}</div>`
        : '';
      return `<blockquote>
        <p>${escapeHtml(h.content)}</p>
        <footer>${page}${noteHtml}</footer>
      </blockquote>`;
    })
    .join('\n');

  return `
    <section>
      <h2>Notable Quotes <span class="count">(${highlights.length})</span></h2>
      ${items}
    </section>`;
}

/** Build notes section */
function renderNotes(annotations: Annotation[]): string {
  const notes = annotations.filter((a) => a.type === 'note');
  if (notes.length === 0) return '';

  const items = notes
    .slice(0, 15)
    .map((n) => {
      const page = n.location?.pageIndex != null
        ? `<span class="ref">p. ${n.location.pageIndex! + 1}</span>`
        : '';
      return `<div class="note-item">
        <p class="note-content">${escapeHtml(n.content)}</p>
        ${n.note ? `<p class="note-detail">${escapeHtml(n.note)}</p>` : ''}
        ${page}
      </div>`;
    })
    .join('\n');

  return `
    <section>
      <h2>Reader Notes <span class="count">(${notes.length})</span></h2>
      ${items}
    </section>`;
}

/** Build the reading stats section */
function renderStats(book: BookMeta, stats: ReadingStats): string {
  const pct = stats.progress != null ? Math.round(stats.progress) : 0;
  const total = stats.totalAnnotations ?? 0;
  const items: string[] = [];

  if (stats.totalPages) {
    items.push(
      `<li><strong>Pages:</strong> ${stats.currentPage ?? 0} / ${stats.totalPages}</li>`,
    );
  }
  items.push(`<li><strong>Progress:</strong> ${pct}%</li>`);
  items.push(
    `<li><strong>Annotations:</strong> ${total} (${stats.highlights ?? 0} highlights, ${stats.notes ?? 0} notes, ${stats.bookmarks ?? 0} bookmarks)</li>`,
  );

  return `
    <section>
      <h2>Reading Stats</h2>
      <ul class="stats">${items.join('\n')}</ul>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${pct}%"></div>
      </div>
    </section>`;
}

/** Build discussion questions section (placeholder — filled by API) */
function renderDiscussionQuestions(questions: string[]): string {
  if (questions.length === 0) return '';

  const items = questions
    .map((q, i) => `<li>${escapeHtml(q)}</li>`)
    .join('\n');

  return `
    <section>
      <h2>Discussion Questions</h2>
      <ol class="questions">${items}</ol>
    </section>`;
}

/** Full-page HTML with print-ready CSS */
const STYLES = `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 24px;
      color: #1a1a1a;
      background: #fff;
      line-height: 1.7;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 32px;
      border-bottom: 2px solid #d97706;
    }
    header h1 { font-size: 28px; margin-bottom: 4px; color: #111; }
    header .author { font-size: 18px; color: #555; font-style: italic; }
    header .meta { font-size: 13px; color: #888; margin-top: 8px; }
    h2 {
      font-size: 20px; color: #92400e; margin: 32px 0 16px;
      padding-bottom: 6px; border-bottom: 1px solid #fbbf24;
    }
    .count { font-size: 13px; color: #aaa; font-weight: normal; }
    section { margin-bottom: 24px; }
    blockquote {
      border-left: 3px solid #d97706;
      margin: 12px 0;
      padding: 8px 16px;
      background: #fffbeb;
      border-radius: 0 6px 6px 0;
    }
    blockquote p { font-style: italic; }
    blockquote footer { font-size: 12px; color: #888; margin-top: 4px; }
    .quote-note { font-size: 13px; color: #555; font-style: normal; margin-top: 4px; }
    .ref { font-size: 12px; color: #999; }
    .note-item { margin: 10px 0; padding: 8px 12px; background: #f9fafb; border-radius: 6px; }
    .note-content { font-weight: 500; }
    .note-detail { font-size: 13px; color: #666; margin-top: 4px; }
    ul.themes, ul.stats { list-style: none; }
    ul.themes li { padding: 4px 0; }
    ul.stats li { padding: 3px 0; font-size: 14px; }
    ol.questions { padding-left: 24px; }
    ol.questions li { margin: 10px 0; line-height: 1.6; }
    .progress-bar {
      height: 8px; background: #f3f4f6; border-radius: 4px;
      margin-top: 12px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, #f59e0b, #d97706);
      border-radius: 4px; transition: width 0.3s;
    }
    .footer {
      margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb;
      text-align: center; font-size: 12px; color: #aaa;
    }
    @media print {
      body { padding: 0; }
      h2 { break-after: avoid; }
      blockquote { break-inside: avoid; }
    }
  </style>`;

export interface DiscussionGuideOptions {
  book: BookMeta;
  annotations: Annotation[];
  stats?: ReadingStats;
  discussionQuestions?: string[];
}

/**
 * Generate a discussion guide as a full HTML document string.
 */
export function generateDiscussionGuideHtml(
  options: DiscussionGuideOptions,
): string {
  const { book, annotations, stats, discussionQuestions } = options;

  const safeStats: ReadingStats = {
    totalPages: stats?.totalPages ?? book.totalPages,
    currentPage: stats?.currentPage ?? book.currentPage,
    progress: stats?.progress ?? book.progress,
    totalAnnotations: stats?.totalAnnotations ?? annotations.length,
    highlights: stats?.highlights ?? annotations.filter((a) => a.type === 'highlight').length,
    notes: stats?.notes ?? annotations.filter((a) => a.type === 'note').length,
    bookmarks: stats?.bookmarks ?? annotations.filter((a) => a.type === 'bookmark').length,
  };

  const pct = safeStats.progress != null ? Math.round(safeStats.progress) : 0;

  const sections = [
    renderStats(book, safeStats),
    renderThemes(annotations),
    renderQuotes(annotations),
    renderNotes(annotations),
    renderDiscussionQuestions(discussionQuestions ?? []),
  ]
    .filter(Boolean)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discussion Guide: ${escapeHtml(book.title)}</title>
  ${STYLES}
</head>
<body>
  <header>
    <h1>${escapeHtml(book.title)}</h1>
    <div class="author">by ${escapeHtml(book.author)}</div>
    <div class="meta">Discussion Guide &middot; ${new Date().toLocaleDateString()} &middot; ${pct}% complete</div>
  </header>
  ${sections}
  <div class="footer">Generated by read-pal</div>
</body>
</html>`;
}

/**
 * Copy the discussion guide HTML to clipboard as rich text.
 * Falls back to copying the raw HTML.
 */
export async function copyDiscussionGuide(html: string): Promise<boolean> {
  // Try clipboard API with both text/html and text/plain
  if (navigator.clipboard?.write) {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob(
        [html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()],
        { type: 'text/plain' },
      );
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': textBlob,
        }),
      ]);
      return true;
    } catch {
      // Fall through
    }
  }
  // Fallback: copy as plain text
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(html);
      return true;
    } catch {
      // Fall through
    }
  }
  return false;
}

/**
 * Download the discussion guide as an HTML file.
 */
export function downloadDiscussionGuide(
  html: string,
  bookTitle: string,
): void {
  const safeTitle = bookTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `discussion-guide-${safeTitle}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open the discussion guide in a new window for printing.
 */
export function printDiscussionGuide(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  // Wait for content to render then trigger print
  win.onload = () => {
    win.print();
  };
}
