import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CHARS_PER_PAGE,
  splitChapterIntoPages,
} from '../chapter-paginator';

/** Every tag in a fragment must be balanced (no dangling open/close). */
function isBalanced(fragment: string): boolean {
  const stack: string[] = [];
  const voidEls = new Set(['br', 'img', 'hr', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr', 'input']);
  for (const m of fragment.matchAll(/<(\/)?([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/)?>/g)) {
    const name = m[2].toLowerCase();
    if (m[4] === '/' || voidEls.has(name)) continue;
    if (m[1] === '/') {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

describe('splitChapterIntoPages', () => {
  it('never splits a word: page boundaries only follow closing tags', () => {
    const paras = Array.from(
      { length: 40 },
      (_, i) => `<p>paragraph ${i} with words like gigantic and resonance that must stay whole</p>`,
    );
    const pages = splitChapterIntoPages(paras.join('\n'), 400);
    const joined = pages.map((p) => p.html.replace(/\n/g, '')).join('');
    // Content round-trips (mod whitespace joins between blocks)
    expect(joined).toContain('gigantic and resonance');
    for (const page of pages) {
      // No page may end mid-word: strip tags, the visible text must not
      // end with a partial token that continues on the next page.
      expect(page.html).toMatch(/(<\/[a-z0-9]+>|[^a-zA-Z0-9])$/);
    }
  });

  it('keeps nested structures as one balanced block', () => {
    const nested = '<div class="chapter"><p>one</p><p>two</p><p>three</p></div>';
    const pages = splitChapterIntoPages(nested, DEFAULT_MAX_CHARS_PER_PAGE);
    // Fits in one page
    expect(pages).toHaveLength(1);
    expect(pages[0].html).toBe(nested);
  });

  it('emits balanced per-page HTML for nested long chapters', () => {
    // One big wrapper around many paragraphs — pagination must split at
    // top-level closes, which here means the whole wrapper... so instead
    // use many sibling wrappers to force multiple pages.
    const wrappers = Array.from(
      { length: 30 },
      (_, i) => `<div class="sect"><p>section ${i} alpha</p><p>section ${i} beta</p></div>`,
    );
    const pages = splitChapterIntoPages(wrappers.join('\n'), 300);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(isBalanced(page.html)).toBe(true);
    }
  });

  it('treats pre blocks as atomic even when oversized', () => {
    const pre = `<pre>${'code line\n'.repeat(400)}</pre>`;
    const pages = splitChapterIntoPages(pre, 200);
    expect(pages).toHaveLength(1);
    expect(pages[0].html.startsWith('<pre>')).toBe(true);
  });

  it('keeps charOffset consistent with concatenated page lengths', () => {
    // Paragraphs end with terminal punctuation (realistic prose) so the
    // fragment-coalescing pre-pass leaves them as independent blocks.
    const paras = Array.from({ length: 25 }, (_, i) => `<p>para ${i} text.</p>`);
    const pages = splitChapterIntoPages(paras.join('\n'), 150);
    expect(pages.length).toBeGreaterThan(1);
    let expected = 0;
    for (const page of pages) {
      expect(page.charOffset).toBe(expected);
      expected += page.html.length;
    }
  });

  it('handles empty content', () => {
    expect(splitChapterIntoPages('')).toEqual([{ html: '', charOffset: 0 }]);
  });
});

describe('invisible metadata blocks', () => {
  it('drops leading <style>/<head> blocks so page 1 has visible text', () => {
    // Shape seen on Gutenberg TEI books: multi-KB CSS then real content.
    const raw = '<style>body { color: black; }</style>\n<head><title>x</title></head>\n'
      + '<p>It is a truth universally acknowledged, that a single man in possession'
      + ' of a good fortune, must be in want of a wife.</p>';
    // Small maxChars so the whole chapter doesn't take the single-page shortcut.
    const pages = splitChapterIntoPages(raw, 80);
    expect(pages).toHaveLength(1);
    expect(pages[0].html).not.toContain('<style>');
    expect(pages[0].html).toContain('truth universally acknowledged');
  });

  it('keeps style tags nested inside visible containers', () => {
    const raw = '<div class="sect"><style>.x{}</style><p>visible text</p></div>';
    const pages = splitChapterIntoPages(raw, 4000);
    expect(pages[0].html).toContain('<div');
    expect(pages[0].html).toContain('visible text');
  });
});

describe('plain-text chapters (no HTML tags)', () => {
  it('segments a long tag-less chapter at blank lines', () => {
    const paras = Array.from({ length: 60 }, (_, i) => `第${i}章的内容。` + '道可道非常道。'.repeat(20));
    const text = paras.join('\n\n'); // ~13k chars, no tags
    const pages = splitChapterIntoPages(text, 4000);
    expect(pages.length).toBeGreaterThan(2);
    for (const p of pages) {
      expect(p.html.length).toBeLessThanOrEqual(4000);
    }
    // Content round-trips
    expect(pages.map((p) => p.html).join('\n\n').replace(/\n\n/g, '\n\n').length).toBeGreaterThan(text.length - 100);
  });
});
