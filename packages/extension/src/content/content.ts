/**
 * read-pal Extension — Content Script
 *
 * Runs on every page. Provides:
 * - Article content extraction for the popup
 * - In-page text selection toolbar (highlight, note, save to read-pal)
 * - Visual highlights for saved annotations
 */

export {};

// ============================================================================
// Types
// ============================================================================

interface ExtractedContent {
  title: string;
  author: string;
  content: string;
  wordCount: number;
}

interface SelectionToolbarConfig {
  highlightColor: string;
  saveEndpoint: string;
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractContent(): ExtractedContent {
  const title = document.title || '';
  const author =
    getMeta('author') ||
    getMeta('article:author') ||
    getMeta('og:article:author') ||
    '';

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
  const clone = el.cloneNode(true) as Element;

  const unwanted = clone.querySelectorAll(
    'script, style, nav, header, footer, aside, .ad, .advertisement, .social-share, .comments, noscript, iframe',
  );
  unwanted.forEach((u) => u.remove());

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

// ============================================================================
// In-Page Selection Toolbar
// ============================================================================

const TOOLBAR_ID = 'readpal-selection-toolbar';
const HIGHLIGHT_CLASS = 'readpal-highlight';

let currentSelection: Selection | null = null;

function getOrCreateToolbar(): HTMLDivElement {
  let toolbar = document.getElementById(TOOLBAR_ID) as HTMLDivElement | null;
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.style.cssText = `
      position: fixed;
      display: none;
      z-index: 2147483647;
      background: #1a1a2e;
      border-radius: 8px;
      padding: 6px 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      gap: 2px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const buttons = [
      { id: 'rp-highlight', label: '\u{1F4A1}', title: 'Highlight', action: doHighlight },
      { id: 'rp-note', label: '\u{1F4DD}', title: 'Add Note', action: doNote },
      { id: 'rp-save', label: '\u{1F4BE}', title: 'Save to read-pal', action: doSave },
    ];

    buttons.forEach(({ id, label, title, action }) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.textContent = label;
      btn.title = title;
      btn.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px 10px;
        font-size: 16px;
        border-radius: 6px;
        transition: background 0.15s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'none';
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        action();
        hideToolbar();
      });
      toolbar!.appendChild(btn);
    });

    document.body.appendChild(toolbar);
  }
  return toolbar;
}

function showToolbar(rect: DOMRect) {
  const toolbar = getOrCreateToolbar();
  const top = rect.top + window.scrollY - 48;
  const left = rect.left + rect.width / 2 - 60;

  toolbar.style.top = `${Math.max(4, top)}px`;
  toolbar.style.left = `${Math.max(4, left)}px`;
  toolbar.style.display = 'flex';
}

function hideToolbar() {
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (toolbar) {
    toolbar.style.display = 'none';
  }
}

// ============================================================================
// Annotation Actions
// ============================================================================

function doHighlight() {
  if (!currentSelection || currentSelection.rangeCount === 0) return;
  const range = currentSelection.getRangeAt(0);
  const text = range.toString().trim();
  if (!text) return;

  // Wrap selection in a highlight span
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS;
  span.style.cssText = 'background: rgba(251, 191, 36, 0.35); border-radius: 2px; padding: 1px 0;';
  try {
    range.surroundContents(span);
  } catch {
    // Range spans multiple elements — just save without visual highlight
  }

  // Send to background for persistence
  chrome.runtime.sendMessage({
    action: 'saveAnnotation',
    data: {
      type: 'highlight',
      content: text.slice(0, 5000),
      url: window.location.href,
      title: document.title,
    },
  });

  currentSelection?.removeAllRanges();
}

function doNote() {
  if (!currentSelection || currentSelection.rangeCount === 0) return;
  const text = currentSelection.getRangeAt(0).toString().trim();
  if (!text) return;

  const note = prompt('Add a note for this passage:');
  if (!note) return;

  chrome.runtime.sendMessage({
    action: 'saveAnnotation',
    data: {
      type: 'note',
      content: text.slice(0, 5000),
      note: note.slice(0, 2000),
      url: window.location.href,
      title: document.title,
    },
  });

  currentSelection?.removeAllRanges();
}

async function doSave() {
  if (!currentSelection || currentSelection.rangeCount === 0) return;
  const text = currentSelection.getRangeAt(0).toString().trim();
  if (!text) return;

  // Save selected text as a bookmark-like annotation
  chrome.runtime.sendMessage({
    action: 'saveAnnotation',
    data: {
      type: 'bookmark',
      content: text.slice(0, 5000),
      url: window.location.href,
      title: document.title,
    },
  });

  currentSelection?.removeAllRanges();
}

// ============================================================================
// Event Listeners
// ============================================================================

document.addEventListener('mouseup', (e) => {
  // Don't show toolbar if clicking inside our toolbar
  if ((e.target as Element)?.closest(`#${TOOLBAR_ID}`)) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    hideToolbar();
    currentSelection = null;
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 3) {
    hideToolbar();
    currentSelection = null;
    return;
  }

  currentSelection = selection;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  showToolbar(rect);
});

document.addEventListener('mousedown', (e) => {
  if (!(e.target as Element)?.closest(`#${TOOLBAR_ID}`)) {
    hideToolbar();
  }
});

// Handle scroll to reposition
document.addEventListener('scroll', () => {
  if (currentSelection && currentSelection.rangeCount > 0) {
    const rect = currentSelection.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0) {
      showToolbar(rect);
    } else {
      hideToolbar();
    }
  }
});

// ============================================================================
// Message Handling (from popup)
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'extractContent') {
    const extracted = extractContent();
    sendResponse(extracted);
  }
  return true;
});

// ============================================================================
// Inject highlight styles
// ============================================================================

const style = document.createElement('style');
style.textContent = `
  .${HIGHLIGHT_CLASS} {
    background: rgba(251, 191, 36, 0.35);
    border-radius: 2px;
    padding: 1px 0;
    transition: background 0.2s;
  }
  .${HIGHLIGHT_CLASS}:hover {
    background: rgba(251, 191, 36, 0.55);
  }
`;
document.head.appendChild(style);
