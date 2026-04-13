/**
 * read-pal Extension — Background Service Worker
 *
 * Handles extension lifecycle events, context menu actions,
 * and annotation saves from the content script.
 */

export {};

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: 'save-to-readpal',
    title: 'Save to read-pal',
    contexts: ['page', 'link'],
  });
});

// Handle context menu clicks
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-readpal') {
    const settings = await getSettings();
    if (!settings) {
      chrome.action?.openPopup?.();
      return;
    }

    if (tab?.id) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'extractContent',
        });

        if (response?.content) {
          await fetch(`${settings.serverUrl}/api/books`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.apiToken}`,
            },
            body: JSON.stringify({
              title: response.title || tab.title,
              author: response.author || '',
              sourceUrl: tab.url,
              content: response.content,
              contentType: 'article',
            }),
          });
        }
      } catch {
        // Silently fail — user can try from popup
      }
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'saveAnnotation') {
    handleAnnotationSave(message.data);
    sendResponse({ success: true });
  }
  return true;
});

async function handleAnnotationSave(data: {
  type: 'highlight' | 'note' | 'bookmark';
  content: string;
  note?: string;
  url?: string;
  title?: string;
}): Promise<void> {
  const settings = await getSettings();
  if (!settings) return;

  try {
    await fetch(`${settings.serverUrl}/api/annotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiToken}`,
      },
      body: JSON.stringify({
        type: data.type,
        content: data.content,
        note: data.note,
        sourceUrl: data.url,
        sourceTitle: data.title,
      }),
    });
  } catch {
    // Queue for retry (not implemented — fire and forget for now)
  }
}

interface Settings {
  serverUrl: string;
  apiToken: string;
}

async function getSettings(): Promise<Settings | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl', 'apiToken'], (result) => {
      if (result.serverUrl && result.apiToken) {
        resolve({ serverUrl: result.serverUrl, apiToken: result.apiToken });
      } else {
        resolve(null);
      }
    });
  });
}
