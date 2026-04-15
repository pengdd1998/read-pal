// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Decode common HTML entities to their plain-text equivalents.
 * Handles named entities (&amp;, &lt;, &gt;, &quot;, &apos;, &nbsp;)
 * and numeric entities (&#39;, &#x27;, &#NNN;).
 */
export function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');
}
