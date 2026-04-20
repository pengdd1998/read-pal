// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random ID using crypto.randomUUID when available,
 * falling back to timestamp + crypto.getRandomValues.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + secure random
  const arr = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  }
  const suffix = Array.from(arr, (b) => b.toString(36)).join('');
  return `${Date.now()}-${suffix}`;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

/**
 * Decode common HTML entities to their plain-text equivalents.
 * Handles named entities (&amp;, &lt;, &gt;, &quot;, &apos;, &nbsp;)
 * and numeric entities (&#39;, &#x27;, &#NNN;).
 *
 * Uses a single-pass regex to avoid double-escaping issues.
 */
export function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
