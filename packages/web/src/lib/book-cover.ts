// UI-R-08: warm 5-step ramp + sage/pine only (design review 阶段1: no
// rose/sky/violet/cyan — cold covers broke the "warm study" world).
const COVER_PALETTES = [
  ['from-amber-400 to-orange-600', 'text-amber-50'],
  ['from-yellow-500 to-amber-700', 'text-amber-50'],
  ['from-orange-500 to-red-700', 'text-orange-50'],
  ['from-stone-400 to-stone-600', 'text-stone-50'],
  ['from-emerald-500 to-teal-700', 'text-emerald-50'],
  ['from-lime-600 to-emerald-800', 'text-lime-50'],
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
