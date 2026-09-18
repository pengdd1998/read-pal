/**
 * Paragraph-fragment coalescing.
 *
 * Upstream ingestion sometimes stores ONE paragraph as TWO blocks — the
 * original sin surfaces in the reader as words cut in half:
 *   "…are blue and giga" | "ntic — their retinas are…"
 * (giga|ntic = gigantic). Render-layer merge per the design-review P0 fix:
 * a block is a *fragment* when its first alphabetic character is lowercase
 * AND the previous paragraph ends mid-sentence (letter/digit/comma/dash,
 * no terminal punctuation). Both conditions must hold, so:
 *   - CJK text (no case) is never merged — Chinese prose/poetry is safe;
 *   - a paragraph legitimately starting lowercase after a full stop stays.
 */

const TERMINAL_END_RE = /[.!?…。！？；」』]$/;
const MID_SENTENCE_END_RE = /[a-zA-Z0-9,;:\-–—'"”’]$/;

function blockText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function isFragment(prev: Element, cur: Element): boolean {
  if (prev.tagName !== 'P' || cur.tagName !== 'P') return false;
  const curText = blockText(cur);
  const firstAlpha = curText.match(/[a-zA-Z]/);
  // First alphabetic char must be lowercase ("ntic…"), not "But she…".
  if (!firstAlpha || firstAlpha[0] !== firstAlpha[0].toLowerCase()) return false;
  const prevText = blockText(prev);
  if (!prevText) return false;
  // Previous paragraph must end mid-sentence ("…and giga"), not "…dinner."
  if (TERMINAL_END_RE.test(prevText)) return false;
  return MID_SENTENCE_END_RE.test(prevText);
}

/**
 * Merge fragment <p> blocks into their predecessor. Pure DOM transform —
 * runs before pagination so a merged paragraph never spans two pages.
 */
export function coalesceHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined' || !/<p[\s>]/i.test(html)) return html;
  // Parse into <body> directly — never wrap in a synthetic <div>. Cross-file
  // chapter slices open with stray closers (`…</style></span></div></div>`);
  // inside a wrapper those closers terminate the wrapper early, stranding the
  // rest of the chapter as body *siblings* that firstElementChild.innerHTML
  // silently dropped (found by e2e-core: Pride & Prejudice ch.1 rendered the
  // 3.8KB <style> CSS text instead of the novel — 93% of the chapter lost).
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  if (!root) return html;

  // Such slices also leave all content nested in ONE wrapper div, which the
  // paginator (top-level block splitter) would render as a single overlong
  // page. Hoist the lone wrapper's children so real block boundaries show.
  while (root.children.length === 1 && root.firstElementChild?.tagName === 'DIV') {
    const wrap = root.firstElementChild;
    while (wrap.firstChild) root.insertBefore(wrap.firstChild, wrap);
    wrap.remove();
  }

  const children = Array.from(root.children);
  let prev = children[0];
  for (let i = 1; i < children.length; i++) {
    const cur = children[i];
    if (prev && isFragment(prev, cur)) {
      prev.append(' ');
      while (cur.firstChild) prev.append(cur.firstChild);
      cur.remove();
      // prev stays the merge target so consecutive fragments chain into it.
    } else {
      prev = cur;
    }
  }
  return root.innerHTML;
}
