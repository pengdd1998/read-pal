/**
 * read-pal Extension — Popup Script
 *
 * Manages the extension popup UI: save articles, configure settings,
 * and open the read-pal reader.
 */

const settingsView = document.getElementById('settings-view')!;
const mainView = document.getElementById('main-view')!;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const apiTokenInput = document.getElementById('api-token') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('save-settings')!;
const pageTitleEl = document.getElementById('page-title')!;
const pageUrlEl = document.getElementById('page-url')!;
const saveArticleBtn = document.getElementById('save-article')!;
const saveStatusEl = document.getElementById('save-status')!;
const openReaderBtn = document.getElementById('open-reader')!;
const openSettingsBtn = document.getElementById('open-settings')!;

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

function showView(view: 'settings' | 'main') {
  settingsView.style.display = view === 'settings' ? 'block' : 'none';
  mainView.style.display = view === 'main' ? 'block' : 'none';
}

function showStatus(message: string, type: 'success' | 'error' | 'info') {
  saveStatusEl.style.display = 'block';
  saveStatusEl.className = `status status-${type}`;
  saveStatusEl.textContent = message;
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// Initialize
async function init() {
  const settings = await getSettings();

  if (!settings) {
    showView('settings');
    return;
  }

  showView('main');

  const tab = await getCurrentTab();
  if (tab) {
    pageTitleEl.textContent = tab.title || 'Untitled';
    pageUrlEl.textContent = tab.url || '';
  }
}

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  const apiToken = apiTokenInput.value.trim();

  if (!serverUrl || !apiToken) {
    alert('Please enter both server URL and API token.');
    return;
  }

  // Test connection
  saveSettingsBtn.textContent = 'Testing connection...';
  saveSettingsBtn.setAttribute('disabled', 'true');

  try {
    const res = await fetch(`${serverUrl}/health`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });

    if (res.ok) {
      chrome.storage.sync.set({ serverUrl, apiToken }, () => {
        showView('main');
        init();
      });
    } else {
      alert('Connection failed. Check your server URL and token.');
    }
  } catch {
    alert('Cannot reach server. Check the URL.');
  } finally {
    saveSettingsBtn.textContent = 'Save Settings';
    saveSettingsBtn.removeAttribute('disabled');
  }
});

// Save article
saveArticleBtn.addEventListener('click', async () => {
  const settings = await getSettings();
  if (!settings) { showView('settings'); return; }

  const tab = await getCurrentTab();
  if (!tab?.url || !tab?.id) return;

  saveArticleBtn.innerHTML = '<span class="spinner"></span>Saving...';
  saveArticleBtn.setAttribute('disabled', 'true');
  saveStatusEl.style.display = 'none';

  try {
    // Get page content from content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });

    if (!response?.content) {
      showStatus('Could not extract page content', 'error');
      return;
    }

    const res = await fetch(`${settings.serverUrl}/api/books`, {
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

    if (res.ok) {
      showStatus('Saved to your library!', 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      showStatus(err.error?.message || 'Failed to save', 'error');
    }
  } catch (err) {
    showStatus('Error saving article', 'error');
  } finally {
    saveArticleBtn.innerHTML = 'Save to read-pal';
    saveArticleBtn.removeAttribute('disabled');
  }
});

// Open reader
openReaderBtn.addEventListener('click', async () => {
  const settings = await getSettings();
  if (settings) {
    chrome.tabs.create({ url: settings.serverUrl });
  }
});

// Open settings
openSettingsBtn.addEventListener('click', () => {
  showView('settings');
  chrome.storage.sync.get(['serverUrl', 'apiToken'], (result) => {
    serverUrlInput.value = result.serverUrl || '';
    apiTokenInput.value = result.apiToken || '';
  });
});

init();
