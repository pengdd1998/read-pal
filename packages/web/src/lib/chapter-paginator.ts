/**
 * Chapter paginator — splits chapter HTML content into page segments
 * at block-level boundaries without breaking mid-tag.
 */

export interface PageSegment {
  html: string;
  charOffset: number;
}

export const DEFAULT_MAX_CHARS_PER_PAGE = 4000;

// Block-level closing tags that mark safe split points
const BLOCK_CLOSE_RE = /<\/(?:p|div|pre|blockquote|figure|table|ul|ol|li|section|article|dl|dt|dd|h[1-6]|hr|thead|tbody|tfoot|tr)>/gi;

// Elements that should never be split (treated as atomic)
const ATOMIC_OPEN_RE = /^<(pre|figure|table|img)\b/i;

/**
 * Split raw HTML into top-level blocks at block-level closing tags.
 * Each block is a self-contained HTML fragment ending at a closing tag.
 */
function extractBlocks(html: string): string[] {
  const blocks: string[] = [];
  let lastIndex = 0;

  BLOCK_CLOSE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BLOCK_CLOSE_RE.exec(html)) !== null) {
    const end = match.index + match[0].length;
    const block = html.slice(lastIndex, end).trim();
    if (block) {
      blocks.push(block);
    }
    lastIndex = end;
  }

  // Trailing content after the last closing tag (e.g. loose text)
  const tail = html.slice(lastIndex).trim();
  if (tail) {
    blocks.push(tail);
  }

  return blocks;
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
    offset += currentLen;
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

