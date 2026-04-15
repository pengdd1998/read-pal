/**
 * Cross-browser clipboard utilities.
 *
 * `navigator.clipboard.writeText()` requires a secure context (HTTPS) and
 * isn't available in all browsers. This module provides a fallback using a
 * temporary textarea element.
 */

/**
 * Copy text to the clipboard. Uses the Clipboard API when available,
 * falling back to a temporary textarea for older browsers or non-HTTPS.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Modern Clipboard API (requires secure context)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to textarea fallback
    }
  }

  // Fallback: create a temporary textarea and use execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Position off-screen to avoid visual flash
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
