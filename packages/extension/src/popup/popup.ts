/**
 * read-pal Extension — Popup Script
 *
 * Manages the extension popup UI: save articles, configure settings,
 * view recent saves, and open the read-pal reader.
 */

export {};

interface Settings {
  serverUrl: string;
  apiToken: string;
}

interface RecentSave {
  title: string;
  url: string;
  timestamp: number;
}

// DOM elements
const settingsView = document.getElementById('settings-view')!;
const mainView = document.getElementById('main-view')!;
const editSettingsView = document.getElementById('edit-settings-view')!;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const apiTokenInput = document.getElementById('api-token') as HTMLInputElement;
const editServerUrlInput = document.getElementById('edit-server-url') as HTMLInputElement;
const editApiTokenInput = document.getElementById('edit-api-token') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('save-settings')!;
const updateSettingsBtn = document.getElementById('update-settings')!;
const disconnectBtn = document.getElementById('disconnect')!;
const backToMainBtn = document.getElementById('back-to-main')!;
const pageTitleEl = document.getElementById('page-title')!;
const pageUrlEl = document.getElementById('page-url')!;
const saveArticleBtn = document.getElementById('save-article')!;
const saveStatusEl = document.getElementById('save-status')!;
const settingsStatusEl = document.getElementById('settings-status')!;
const editSettingsStatusEl = document.getElementById('edit-settings-status')!;
const openReaderBtn = document.getElementById('open-reader')!;
const openSettingsBtn = document.getElementById('open-settings')!;
const recentSavesEl = document.getElementById('recent-saves')!;
const connectionBadge = document.getElementById('connection-badge')!;

function showView(view: 'settings' | 'main' | 'edit-settings') {
  settingsView.style.display = view === 'settings' ? 'block' : 'none';
  mainView.style.display = view === 'main' ? 'block' : 'none';
  editSettingsView.style.display = view === 'edit-settings' ? 'block' : 'none';
}

function showStatus(el: HTMLElement, message: string, type: 'success' | 'error' | 'info') {
  el.style.display = 'flex';
  el.className = `status status-${type}`;
  const icon = type === 'success' ? '<span class="check-icon">&#10003;</span>' : '';
  el.innerHTML = `${icon}${message}`;
}

function showStatusWithTimeout(el: HTMLElement, message: string, type: 'success' | 'error' | 'info', ms = 3000) {
  showStatus(el, message, type);
  setTimeout(() => { el.style.display = 'none'; }, ms);
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

function getRecentSaves(): Promise<RecentSave[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['recentSaves'], (result) => {
      resolve(result.recentSaves || []);
    });
  });
}

function addRecentSave(save: RecentSave): Promise<void> {
  return new Promise((resolve) => {
    getRecentSaves().then((saves) => {
      const updated = [save, ...saves].slice(0, 10);
      chrome.storage.local.set({ recentSaves: updated }, () => resolve());
    });
  });
}

function renderRecentSaves(saves: RecentSave[]) {
  if (saves.length === 0) {
    recentSavesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128218;</div>
        <div>No saved articles yet</div>
      </div>`;
    return;
  }
  recentSavesEl.innerHTML = saves.map((s) => {
    const ago = timeAgo(s.timestamp);
    const domain = extractDomain(s.url);
    return `
      <div class="recent-item">
        <span class="recent-dot article"></span>
        <div class="recent-info">
          <div class="recent-title">${escapeHtml(s.title)}</div>
          <div class="recent-meta">${domain} &middot; ${ago}</div>
        </div>
      </div>`;
  }).join('');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function checkConnection(settings: Settings): Promise<boolean> {
  try {
    const res = await fetch(`${settings.serverUrl}/health`, {
      headers: { 'Authorization': `Bearer ${settings.apiToken}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Initialize
async function init() {
  const settings = await getSettings();

  if (!settings) {
    showView('settings');
    return;
  }

  showView('main');

  // Check connection
  const connected = await checkConnection(settings);
  if (connected) {
    connectionBadge.className = 'connection-badge ok';
    connectionBadge.innerHTML = '<span class="dot"></span>Connected';
  } else {
    connectionBadge.className = 'connection-badge err';
    connectionBadge.innerHTML = '<span class="dot"></span>Offline';
  }

  // Load current tab info
  const tab = await getCurrentTab();
  if (tab) {
    pageTitleEl.textContent = tab.title || 'Untitled';
    pageUrlEl.textContent = tab.url || '';
  }

  // Load recent saves
  const saves = await getRecentSaves();
  renderRecentSaves(saves);
}

// Save settings (initial setup)
saveSettingsBtn.addEventListener('click', async () => {
  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, '');
  const apiToken = apiTokenInput.value.trim();

  if (!serverUrl || !apiToken) {
    showStatus(settingsStatusEl, 'Please enter both fields.', 'error');
    return;
  }

  saveSettingsBtn.textContent = 'Connecting...';
  saveSettingsBtn.setAttribute('disabled', 'true');
  settingsStatusEl.style.display = 'none';

  try {
    const res = await fetch(`${serverUrl}/health`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      chrome.storage.sync.set({ serverUrl, apiToken }, () => {
        showStatus(settingsStatusEl, 'Connected!', 'success');
        setTimeout(() => init(), 500);
      });
    } else {
      showStatus(settingsStatusEl, 'Connection failed. Check URL and token.', 'error');
    }
  } catch {
    showStatus(settingsStatusEl, 'Cannot reach server. Check the URL.', 'error');
  } finally {
    saveSettingsBtn.textContent = 'Connect';
    saveSettingsBtn.removeAttribute('disabled');
  }
});

// Update settings
updateSettingsBtn.addEventListener('click', async () => {
  const serverUrl = editServerUrlInput.value.trim().replace(/\/$/, '');
  const apiToken = editApiTokenInput.value.trim();

  if (!serverUrl || !apiToken) {
    showStatus(editSettingsStatusEl, 'Please enter both fields.', 'error');
    return;
  }

  updateSettingsBtn.textContent = 'Updating...';
  updateSettingsBtn.setAttribute('disabled', 'true');

  try {
    const res = await fetch(`${serverUrl}/health`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      chrome.storage.sync.set({ serverUrl, apiToken }, () => {
        showStatus(editSettingsStatusEl, 'Updated!', 'success');
        setTimeout(() => init(), 500);
      });
    } else {
      showStatus(editSettingsStatusEl, 'Connection failed.', 'error');
    }
  } catch {
    showStatus(editSettingsStatusEl, 'Cannot reach server.', 'error');
  } finally {
    updateSettingsBtn.textContent = 'Update';
    updateSettingsBtn.removeAttribute('disabled');
  }
});

// Disconnect
disconnectBtn.addEventListener('click', () => {
  if (confirm('Disconnect from read-pal? You will need to re-enter your settings.')) {
    chrome.storage.sync.remove(['serverUrl', 'apiToken'], () => {
      showView('settings');
      serverUrlInput.value = '';
      apiTokenInput.value = '';
    });
  }
});

// Back to main
backToMainBtn.addEventListener('click', () => {
  init();
});

// Save article
saveArticleBtn.addEventListener('click', async () => {
  const settings = await getSettings();
  if (!settings) { showView('settings'); return; }

  const tab = await getCurrentTab();
  if (!tab?.url || !tab?.id) return;

  // Skip chrome:// and extension pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    showStatus(saveStatusEl, 'Cannot save browser pages.', 'error');
    return;
  }

  saveArticleBtn.innerHTML = '<span class="spinner"></span>Saving...';
  saveArticleBtn.setAttribute('disabled', 'true');
  saveStatusEl.style.display = 'none';

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });

    if (!response?.content) {
      showStatus(saveStatusEl, 'Could not extract page content.', 'error');
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
      saveArticleBtn.className = 'btn btn-success';
      saveArticleBtn.innerHTML = '&#10003; Saved!';
      showStatus(saveStatusEl, 'Added to your library!', 'success');

      // Save to recent
      await addRecentSave({
        title: response.title || tab.title || 'Untitled',
        url: tab.url,
        timestamp: Date.now(),
      });

      // Refresh recent list
      const saves = await getRecentSaves();
      renderRecentSaves(saves);

      // Reset button after delay
      setTimeout(() => {
        saveArticleBtn.className = 'btn btn-primary';
        saveArticleBtn.innerHTML = 'Save to read-pal';
        saveArticleBtn.removeAttribute('disabled');
      }, 2000);
      return;
    } else {
      const err = await res.json().catch(() => ({}));
      showStatus(saveStatusEl, err.error?.message || 'Failed to save.', 'error');
    }
  } catch {
    showStatus(saveStatusEl, 'Error saving article.', 'error');
  }

  saveArticleBtn.innerHTML = 'Save to read-pal';
  saveArticleBtn.removeAttribute('disabled');
});

// Open reader
openReaderBtn.addEventListener('click', async () => {
  const settings = await getSettings();
  if (settings) {
    chrome.tabs.create({ url: settings.serverUrl });
  }
});

// Open settings
openSettingsBtn.addEventListener('click', async () => {
  const settings = await getSettings();
  if (settings) {
    editServerUrlInput.value = settings.serverUrl;
    editApiTokenInput.value = settings.apiToken;
  }
  showView('edit-settings');
});

init();
