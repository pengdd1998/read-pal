/**
 * read-pal Extension — Content Script
 *
 * Runs on every page. Extracts readable article content when requested
 * by the popup.
 */

interface ExtractedContent {
  title: string;
  author: string;
  content: string;
  wordCount: number;
}

function extractContent(): ExtractedContent {
  // Try to get article content using readability heuristics
  const title = document.title || '';
  const author =
    getMeta('author') ||
    getMeta('article:author') ||
    getMeta('og:article:author') ||
    '';

  // Find the main content area
  const article =
    document.querySelector('article') ||
    document.querySelector('[role="article"]') ||
    document.querySelector('.post-content') ||
    document.querySelector('.article-body') ||
    document.querySelector('.entry-content') ||
    document.querySelector('main') ||
    document.querySelector('#content') ||
    document.querySelector('.content');

  let content = '';

  if (article) {
    content = cleanText(article);
  } else {
    // Fallback: grab all paragraphs
    const paragraphs = document.querySelectorAll('p');
    content = Array.from(paragraphs)
      .map((p) => p.textContent?.trim() || '')
      .filter((t) => t.length > 20)
      .join('\n\n');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return { title, author, content, wordCount };
}

function getMeta(name: string): string {
  const el =
    document.querySelector(`meta[name="${name}"]`) ||
    document.querySelector(`meta[property="${name}"]`);
  return el?.getAttribute('content') || '';
}

function cleanText(el: Element): string {
  // Clone to avoid modifying the page
  const clone = el.cloneNode(true) as Element;

  // Remove unwanted elements
  const unwanted = clone.querySelectorAll(
    'script, style, nav, header, footer, aside, .ad, .advertisement, .social-share, .comments, noscript, iframe',
  );
  unwanted.forEach((u) => u.remove());

  // Get text content, preserving paragraph breaks
  const sections: string[] = [];
  const blockElements = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');

  if (blockElements.length > 0) {
    blockElements.forEach((block) => {
      const text = block.textContent?.trim() || '';
      if (text.length > 0) {
        const tag = block.tagName.toLowerCase();
        if (tag.startsWith('h')) {
          sections.push(`\n## ${text}\n`);
        } else if (tag === 'blockquote') {
          sections.push(`> ${text}`);
        } else if (tag === 'li') {
          sections.push(`- ${text}`);
        } else {
          sections.push(text);
        }
      }
    });
  } else {
    sections.push(clone.textContent?.trim() || '');
  }

  return sections.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'extractContent') {
    const extracted = extractContent();
    sendResponse(extracted);
  }
  return true; // Keep the message channel open for async response
});
