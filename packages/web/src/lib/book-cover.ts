const COVER_PALETTES = [
  ['from-rose-400 to-pink-600', 'text-rose-100'],
  ['from-amber-400 to-orange-600', 'text-amber-100'],
  ['from-emerald-400 to-teal-600', 'text-emerald-100'],
  ['from-sky-400 to-blue-600', 'text-sky-100'],
  ['from-violet-400 to-purple-600', 'text-violet-100'],
  ['from-cyan-400 to-indigo-600', 'text-cyan-100'],
] as const;

export function getBookCoverColors(title: string): readonly [string, string] {
  const idx = title.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % COVER_PALETTES.length;
  return COVER_PALETTES[idx];
}

export function isDisplayableAuthor(author: string | undefined | null): boolean {
  if (!author) return false;
  const trimmed = author.trim();
  return trimmed !== '' && trimmed.toLowerCase() !== 'unknown';
}

export function getBookInitials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

/**
 * Shorten a book title for compact display contexts (dropdowns, selects,
 * small chips). EPUB dc:title commonly bundles a marketing subtitle, e.g.
 * '路边野餐（外星人的一次路边野餐…）' where the real title is just '路边野餐'.
 *
 * Strips a trailing parenthetical/bracketed suffix only when the part before
 * it is a plausible standalone title (>=2 chars and under 40% of the total
 * length — so short qualifiers like ' (2nd Edition)' are kept), then
 * truncates to maxLen with an ellipsis. The full title always remains
 * available on the book-detail page and library card.
 */
export function truncateTitle(title: string, maxLen = 45): string {
  if (!title) return '';
  let base = title;
  const m = title.match(/^([^（(【\[｛{]+)[（(【\[｛{].+/u);
  if (m) {
    const prefix = m[1].trim();
    if (prefix.length >= 2 && prefix.length < title.length * 0.4) {
      base = prefix;
    }
  }
  if (base.length <= maxLen) return base;
  return `${base.slice(0, maxLen - 1).trimEnd()}…`;
}
