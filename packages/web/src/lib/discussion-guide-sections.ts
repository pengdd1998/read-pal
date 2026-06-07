import type { Annotation } from '@read-pal/shared';

export interface BookMeta {
  title: string;
  author: string;
  totalPages?: number;
  currentPage?: number;
  progress?: number;
  coverUrl?: string;
}

export interface ReadingStats {
  totalPages?: number;
  currentPage?: number;
  progress?: number;
  totalAnnotations?: number;
  highlights?: number;
  notes?: number;
  bookmarks?: number;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  return new Map([...map.entries()].sort(([, a], [, b]) => b.length - a.length));
}

export function renderThemes(annotations: Annotation[]): string {
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

export function renderQuotes(annotations: Annotation[]): string {
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

export function renderNotes(annotations: Annotation[]): string {
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

export function renderStats(book: BookMeta, stats: ReadingStats): string {
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

export function renderDiscussionQuestions(questions: string[]): string {
  if (questions.length === 0) return '';

  const items = questions
    .map((q) => `<li>${escapeHtml(q)}</li>`)
    .join('\n');

  return `
    <section>
      <h2>Discussion Questions</h2>
      <ol class="questions">${items}</ol>
    </section>`;
}
