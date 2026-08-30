/**
 * Chapter paginator — splits chapter HTML content into page segments
 * at block-level boundaries without breaking mid-tag.
 */

export interface PageSegment {
  html: string;
  charOffset: number;
}

export const DEFAULT_MAX_CHARS_PER_PAGE = 4000;

// Any tag (open / close / self-closing), captured for depth tracking.
const ANY_TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;

// Elements that should never be split (treated as atomic)
const ATOMIC_OPEN_RE = /^<(pre|figure|table|img)\b/i;

// Top-level blocks that carry no visible reading content. Gutenberg TEI
// ebooks open with a multi-KB <style> block (plus <head> remnants); kept
// as blocks they become a first page that renders blank after sanitization
// (found by the real-book E2E matrix: Pride & Prejudice ch.1 showed only
// the chapter heading). Dropped at extraction so pages start at real text.
const INVISIBLE_BLOCK_RE = /^<(style|head|link|title|meta|script)\b/i;

// Void elements — never open a nesting level.
const VOID_ELEMENTS = new Set([
  'br', 'img', 'hr', 'area', 'base', 'col', 'embed', 'source',
  'track', 'wbr', 'input', 'link', 'meta',
]);

/**
 * Split raw HTML into TOP-LEVEL blocks.
 *
 * Depth-aware: a closing tag only ends a block when it returns the stack
 * to the top level. The previous implementation matched any block-level
 * closing tag, so nested structures like `<div><p>a</p><p>b</p></div>`
 * split into `<div><p>a</p>` / `<p>b</p>` / `</div>` — three fragments
 * whose per-page HTML was unbalanced, dropping the wrapper's styling
 * context on the first page and rendering a stray closer on the last.
 */
function extractBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let lastIndex = 0;

  for (const match of html.matchAll(ANY_TAG_RE)) {
    const isClosing = match[1] === '/';
    const isSelfClosing = match[4] === '/';
    const name = match[2].toLowerCase();

    if (isSelfClosing || VOID_ELEMENTS.has(name)) continue;

    if (!isClosing) {
      depth += 1;
      continue;
    }

    depth -= 1;
    if (depth > 0) continue;
    depth = 0; // tolerate stray closers at top level

    const end = (match.index ?? 0) + match[0].length;
    const block = html.slice(lastIndex, end).trim();
    if (block && !INVISIBLE_BLOCK_RE.test(block)) {
      blocks.push(block);
    }
    lastIndex = end;
  }

  // Trailing content after the last top-level close (e.g. loose text)
  const tail = html.slice(lastIndex).trim();
  if (tail) {
    if (!/<[a-z]/i.test(tail)) {
      // Tag-less plain text (Gutenberg text-lineage parsers): no block
      // boundaries exist, so one tail block would become a single
      // over-long page. Soft-wrap on blank lines into <=maxChars groups.
      return [...blocks, ...wrapPlainText(tail)];
    }
    blocks.push(tail);
  }

  return blocks;
}

/** Group plain text into chunks at blank-line boundaries, ≤maxChars each. */
function wrapPlainText(text: string, maxChars: number = DEFAULT_MAX_CHARS_PER_PAGE): string[] {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    // No blank lines at all — hard-split at line breaks near the cap.
    if (text.length <= maxChars) return [text];
    const out: string[] = [];
    let rest = text;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf('\n', maxChars);
      if (cut <= 0) cut = maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
  }
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 2 > maxChars) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Check if a block starts with an atomic element.
 */
function isAtomicBlock(block: string): boolean {
  return ATOMIC_OPEN_RE.test(block.trimStart());
}

/**
 * Split chapter HTML content into page segments at block boundaries.
 *
 * - Splits at `</p>`, `</div>`, `</pre>`, etc.
 * - Treats `<pre>`, `<figure>`, `<table>`, `<img>` as atomic (never split)
 * - Each page stays under `maxChars` (atomic blocks may exceed it)
 */
export function splitChapterIntoPages(
  html: string,
  maxChars: number = DEFAULT_MAX_CHARS_PER_PAGE,
): PageSegment[] {
  if (!html || !html.trim()) {
    return [{ html: '', charOffset: 0 }];
  }

  // Short content fits in one page
  if (html.length <= maxChars) {
    return [{ html, charOffset: 0 }];
  }

  const blocks = extractBlocks(html);
  if (blocks.length === 0) {
    return [{ html, charOffset: 0 }];
  }

  const pages: PageSegment[] = [];
  let currentParts: string[] = [];
  let currentLen = 0;
  let offset = 0;

  const flushPage = () => {
    if (currentParts.length === 0) return;
    const pageHtml = currentParts.join('\n');
    pages.push({ html: pageHtml, charOffset: offset });
    // Track the emitted page length (incl. join newlines) so offsets map
    // into the concatenation of page htmls — currentLen alone drifts by
    // (parts - 1) newlines per page.
    offset += pageHtml.length;
    currentParts = [];
    currentLen = 0;
  };

  for (const block of blocks) {
    const blockLen = block.length;
    const atomic = isAtomicBlock(block);

    // If block alone exceeds max and buffer is non-empty, flush first
    if (atomic && blockLen > maxChars && currentParts.length > 0) {
      flushPage();
      pages.push({ html: block, charOffset: offset });
      offset += blockLen;
      continue;
    }

    // If adding this block would exceed the limit, flush current page first
    if (currentLen + blockLen > maxChars && currentParts.length > 0) {
      flushPage();
    }

    currentParts.push(block);
    currentLen += blockLen;
  }

  // Flush remaining
  flushPage();

  return pages.length > 0 ? pages : [{ html, charOffset: 0 }];
}

