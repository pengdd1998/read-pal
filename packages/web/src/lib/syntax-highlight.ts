/**
 * Lazy-loaded Prism.js syntax highlighting for reader code blocks.
 *
 * Strategy:
 *  - Import Prism + autoloader plugin on demand (keeps initial bundle small).
 *  - On first call, configure Prism to not auto-highlight the whole page.
 *  - `highlightCodeBlocks(root)` finds all `<pre><code>` elements under `root`
 *    and applies highlighting.  If no `language-xxx` class is present the
 *    autoloader will attempt to detect the language from content.
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
 * Highlight all `<pre><code>` blocks under `rootElement`.
 * Safe to call repeatedly (idempotent — skips already-highlighted blocks).
 */
export async function highlightCodeBlocks(rootElement: HTMLElement): Promise<void> {
  await loadPrism();

  const Prism = await import('prismjs').then(m => m.default);
  const blocks = rootElement.querySelectorAll('pre code');

  blocks.forEach((block) => {
    const el = block as HTMLElement;
    // Skip if already highlighted
    if (el.classList.contains('prism-highlighted')) return;

    // Preserve any existing language-* class from EPUB source
    // If none exists, Prism will use a generic fallback
    Prism.highlightElement(el);
    el.classList.add('prism-highlighted');
  });
}
