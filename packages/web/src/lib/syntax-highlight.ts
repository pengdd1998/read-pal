/**
 * Lazy-loaded Prism.js syntax highlighting for reader code blocks.
 *
 * Strategy:
 *  - Import Prism + language components on demand (keeps initial bundle small).
 *  - On first call, configure Prism to not auto-highlight the whole page.
 *  - `highlightCodeBlocks(root)` finds all `<pre><code>` elements under `root`
 *    and applies highlighting.  If no `language-xxx` class is present the
 *    autoloader will attempt to detect the language from content.
 *  - Adds a copy-to-clipboard button to each highlighted block.
 */

let prismReady = false;
let prismPromise: Promise<void> | null = null;

/** Pre-load Prism so the next call to highlightCodeBlocks is synchronous-ish. */
export function preloadPrism(): void {
  if (!prismPromise) loadPrism();
}

async function loadPrism(): Promise<void> {
  if (prismReady) return;

  if (!prismPromise) {
    prismPromise = (async () => {
      // Dynamic imports — tree-shaken away when no code blocks are present
      const Prism = (await import('prismjs')).default;

      // Core components commonly needed in technical books
      await Promise.all([
        import('prismjs/components/prism-clike'),
        import('prismjs/components/prism-javascript'),
        import('prismjs/components/prism-typescript'),
        import('prismjs/components/prism-python'),
        import('prismjs/components/prism-bash'),
        import('prismjs/components/prism-sql'),
        import('prismjs/components/prism-json'),
        import('prismjs/components/prism-css'),
        import('prismjs/components/prism-markup'),
        import('prismjs/components/prism-java'),
        import('prismjs/components/prism-c'),
        import('prismjs/components/prism-cpp'),
        import('prismjs/components/prism-go'),
        import('prismjs/components/prism-rust'),
        import('prismjs/components/prism-yaml'),
        import('prismjs/components/prism-shell-session'),
      ]);

      // Never auto-highlight the entire document — we do it manually per container
      Prism.manual = true;
      prismReady = true;
    })();
  }

  await prismPromise;
}

/**
 * Detect the language from a code element's class list.
 * Looks for `language-xxx` patterns as set by EPUB source or Prism.
 */
function detectLanguage(el: HTMLElement): string | null {
  const match = el.className.match(/(?:^|\s)language-(\S+)/);
  return match ? match[1] : null;
}

/** Human-readable names for common language identifiers. */
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  go: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  css: 'CSS',
  html: 'HTML',
  markup: 'HTML',
  xml: 'XML',
};

/**
 * Insert a copy-to-clipboard button into a `<pre>` element.
 * Idempotent — skips if a button is already present.
 */
function addCopyButton(pre: HTMLPreElement, language: string | null): void {
  if (pre.querySelector('.code-copy-btn')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'code-header';

  // Language label
  if (language) {
    const label = document.createElement('span');
    label.className = 'code-lang-label';
    label.textContent = LANGUAGE_LABELS[language] ?? language;
    wrapper.appendChild(label);
  }

  // Copy button
  const btn = document.createElement('button');
  btn.className = 'code-copy-btn';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy code to clipboard');
  btn.addEventListener('click', async () => {
    const code = pre.querySelector('code');
    const text = code?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    } catch {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }
  });
  wrapper.appendChild(btn);
  pre.appendChild(wrapper);
}

/**
 * Highlight all `<pre><code>` blocks under `rootElement`.
 * Safe to call repeatedly (idempotent — skips already-highlighted blocks).
 */
export async function highlightCodeBlocks(rootElement: HTMLElement): Promise<void> {
  await loadPrism();

  const Prism = await import('prismjs').then(m => m.default);

  // 1. Highlight standard <pre><code> blocks
  const blocks = rootElement.querySelectorAll('pre code');

  blocks.forEach((block) => {
    const el = block as HTMLElement;
    // Skip if already highlighted
    if (el.classList.contains('prism-highlighted')) return;

    // Preserve any existing language-* class from EPUB source
    // If none exists, Prism will use a generic fallback
    Prism.highlightElement(el);
    el.classList.add('prism-highlighted');

    // Add copy button to the parent <pre>
    const pre = el.parentElement;
    if (pre?.tagName === 'PRE') {
      const lang = detectLanguage(el);
      addCopyButton(pre as HTMLPreElement, lang);
    }
  });

  // 2. Handle standalone <pre> blocks without a <code> child (common in some EPUBs)
  const standalonePres = rootElement.querySelectorAll('pre');
  standalonePres.forEach((preEl) => {
    const pre = preEl as HTMLPreElement;
    // Skip if this <pre> already contains a <code> element (handled above)
    if (pre.querySelector('code')) return;
    // Skip if already processed
    if (pre.classList.contains('prism-highlighted')) return;

    // Wrap text content in a <code> element so Prism can highlight it
    const code = document.createElement('code');
    // Transfer any language-* class from <pre> to <code>
    const langClass = Array.from(pre.classList).find((c) => c.startsWith('language-'));
    if (langClass) {
      code.classList.add(langClass);
      pre.classList.remove(langClass);
    }
    code.textContent = pre.textContent;
    pre.textContent = '';
    pre.appendChild(code);

    Prism.highlightElement(code);
    code.classList.add('prism-highlighted');
    pre.classList.add('prism-highlighted');

    const lang = detectLanguage(code);
    addCopyButton(pre, lang);
  });
}
