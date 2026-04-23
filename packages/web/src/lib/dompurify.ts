/**
 * DOMPurify Lazy Loader
 *
 * Singleton DOMPurify instance loaded on demand.
 * Keeps DOMPurify out of the initial bundle (~40KB saving).
 *
 * Extracted from CompanionChat, ReaderView, and chat/page.
 */

let _domPurify: typeof import('dompurify').default | null = null;
let _loadPromise: Promise<void> | null = null;

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
 * Falls back to a minimal safe sanitizer if DOMPurify hasn't loaded yet.
 */
export function purifySync(html: string, config?: Record<string, unknown>): string {
  if (_domPurify) return _domPurify.sanitize(html, config);
  // Fallback: strip only dangerous tags (script, iframe, object, etc.)
  // but preserve safe formatting tags so content is readable.
  return stripDangerousTags(html);
}

/**
 * Minimal HTML sanitizer that removes dangerous elements while preserving
 * safe formatting tags (p, h1-h6, strong, em, etc.).
 */
function stripDangerousTags(html: string): string {
  return html
    .replace(/<\s*\/?\s*(script|iframe|object|embed|applet|form|input|button|textarea|select|option|meta|link|base)\b[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/**
 * Returns true if DOMPurify has finished loading and is ready.
 */
export function isDOMPurifyReady(): boolean {
  return _domPurify !== null;
}

/**
 * Fire-and-forget preload. Accepts an optional onReady callback invoked
 * once DOMPurify is loaded, so callers can trigger a re-render to
 * re-sanitize content that was handled by the fallback.
 */
export function preloadDOMPurify(onReady?: () => void): void {
  if (!_domPurify && !_loadPromise) {
    _loadPromise = import('dompurify').then((m) => {
      _domPurify = m.default;
      onReady?.();
    });
  } else if (_domPurify && onReady) {
    // Already loaded — call immediately
    onReady();
  } else if (_loadPromise && onReady) {
    // Loading in progress — chain callback
    _loadPromise.then(onReady);
  }
}
