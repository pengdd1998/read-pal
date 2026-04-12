/**
 * read-pal Extension — Background Service Worker
 *
 * Handles extension lifecycle events and context menu actions.
 */

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
      // Open popup for setup
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
