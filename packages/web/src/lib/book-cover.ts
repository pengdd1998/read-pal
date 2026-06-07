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
