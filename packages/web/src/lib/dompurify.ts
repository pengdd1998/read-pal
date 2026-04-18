/**
 * DOMPurify Lazy Loader
 *
 * Singleton DOMPurify instance loaded on demand.
 * Keeps DOMPurify out of the initial bundle (~40KB saving).
 *
 * Extracted from CompanionChat, ReaderView, and chat/page.
 */

let _domPurify: typeof import('dompurify').default | null = null;

/**
 * Load DOMPurify (lazy). Returns the cached instance if already loaded.
 */
export async function loadDOMPurify(): Promise<typeof import('dompurify').default> {
  if (!_domPurify) {
    const m = await import('dompurify');
    _domPurify = m.default;
  }
  return _domPurify;
}

/**
 * Synchronous sanitize using cached DOMPurify.
 * Falls back to stripping &lt;script&gt; tags if DOMPurify hasn't loaded yet.
 */
export function purifySync(html: string, config?: Record<string, unknown>): string {
  if (_domPurify) return _domPurify.sanitize(html, config);
  // Safe fallback: strip ALL tags, keep text content only
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Fire-and-forget preload. Call in useEffect to warm the cache.
 */
export function preloadDOMPurify(): void {
  if (!_domPurify) {
    import('dompurify').then((m) => { _domPurify = m.default; });
  }
}
