// ============================================================================
// Utility Functions
// ============================================================================

export * from './idempotency';

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
