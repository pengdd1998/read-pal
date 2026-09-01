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
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return html;

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
