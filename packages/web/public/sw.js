/**
 * read-pal Service Worker v2
 *
 * Caching strategies:
 * - Static assets (JS/CSS/fonts): Cache-first with network fallback
 * - API GET responses: Network-first with cache fallback (stale-while-revalidate)
 * - Book content (/content): Cache-first, long TTL — critical for offline reading
 * - HTML pages: Network-first with offline fallback
 * - Images: Cache-first
 *
 * Features:
 * - Offline fallback page with cached content access
 * - Background sync for queued mutations
 * - Automatic cleanup of old caches on activation
 * - Mutation queue using IndexedDB for offline writes
 * - Book content pre-caching for offline reading
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `readpal-${CACHE_VERSION}`;
const STATIC_CACHE = `readpal-static-${CACHE_VERSION}`;
const API_CACHE = `readpal-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `readpal-images-${CACHE_VERSION}`;
const CONTENT_CACHE = `readpal-content-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/offline',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// --- Install ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Some URLs may fail in dev — that's OK
      });
    }).then(() => self.skipWaiting())
  );
});

// --- Activate — clean up old caches ---
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE, IMAGE_CACHE, CONTENT_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests — queue mutations for background sync
  if (request.method !== 'GET') {
    if (!navigator.onLine) {
      event.respondWith(queueAndRespond(request));
    }
    return;
  }

  // Skip cross-origin requests (except same-origin API through proxy)
  if (url.origin !== location.origin) return;

  // Route to appropriate strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isBookContent(url.pathname)) {
    // Book content: cache-first with very long TTL — critical for offline reading
    event.respondWith(cacheFirstWithTTL(request, CONTENT_CACHE, 86400 * 7)); // 7 days
  } else if (isApiRequest(url.pathname)) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, getApiCacheTTL(url.pathname)));
  } else if (isImageRequest(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else {
    // HTML pages — network first with offline fallback
    event.respondWith(networkFirstWithOfflineFallback(request));
  }
});

// --- Caching Strategies ---

/** Cache-first: serve from cache, fall back to network */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/** Cache-first with TTL check — serves from cache if fresh, refreshes in background */
async function cacheFirstWithTTL(request, cacheName, maxAgeSeconds) {
  const cached = await caches.match(request);
  if (cached) {
    // Check age
    const dateHeader = cached.headers.get('sw-cache-time');
    if (dateHeader) {
      const age = (Date.now() - parseInt(dateHeader, 10)) / 1000;
      if (age < maxAgeSeconds) {
        // Fresh enough — serve immediately, refresh in background if getting stale
        if (age > maxAgeSeconds * 0.5) {
          refreshInBackground(request, cacheName);
        }
        return cached;
      }
    } else {
      // No custom header — just serve
      return cached;
    }
  }

  // Not in cache or stale — fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      // Clone and add custom cache-time header
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const body = await responseToCache.blob();
      const cachedResponse = new Response(body, { headers, status: responseToCache.status, statusText: responseToCache.statusText });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    // Network failed — try stale cache as last resort
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'You are offline and this content is not cached.' } }),
      { headers: { 'Content-Type': 'application/json' }, status: 503 }
    );
  }
}

/** Background refresh without blocking the response */
function refreshInBackground(request, cacheName) {
  fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(cacheName);
      cache.then((c) => {
        const headers = new Headers(response.headers);
        headers.set('sw-cache-time', Date.now().toString());
        response.blob().then((body) => {
          const cachedResponse = new Response(body, { headers, status: response.status, statusText: response.statusText });
          c.put(request, cachedResponse);
        });
      });
    }
  }).catch(() => {
    // Background refresh failed — non-critical
  });
}

/** Determine API cache duration (seconds) based on URL path */
function getApiCacheTTL(pathname) {
  if (pathname.includes('/content')) return 86400;       // Chapter content: 24h
  if (pathname.match(/\/api\/books\/[^/]+$/)) return 300; // Book detail: 5 min
  if (pathname.includes('/annotations/tags')) return 120;  // Tags: 2 min
  if (pathname.includes('/api/settings')) return 60;       // Settings: 1 min
  if (pathname.includes('/api/stats')) return 30;          // Stats: 30s
  return 30; // Default: 30s
}

/** Network-first: try network, fall back to cache with age validation */
async function networkFirstWithCache(request, cacheName, maxAgeSeconds = 30) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const headers = new Headers(response.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const body = await response.clone().blob();
      const cachedResponse = new Response(body, { headers, status: response.status, statusText: response.statusText });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const dateHeader = cached.headers.get('sw-cache-time');
      if (dateHeader) {
        const cacheAge = (Date.now() - parseInt(dateHeader, 10)) / 1000;
        if (cacheAge < maxAgeSeconds * 3) { // Allow up to 3x the TTL when offline
          return cached;
        }
      } else {
        return cached;
      }
    }
    return new Response(
      JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'You are offline' } }),
      { headers: { 'Content-Type': 'application/json' }, status: 503 }
    );
  }
}

/** Network-first for HTML with offline fallback page */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline page
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head>' +
      '<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;background:#f9fafb;margin:0">' +
      '<div style="text-align:center;padding:2rem"><h1 style="font-size:1.5rem;margin-bottom:0.5rem">You\'re offline</h1>' +
      '<p style="color:#6b7280">Check your connection and try again.</p>' +
      '<button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;border-radius:0.5rem;border:none;background:#d97706;color:white;cursor:pointer;font-size:0.875rem">Retry</button>' +
      '</div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// --- Helpers ---

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|svg|ico|woff)$/i.test(pathname) ||
    pathname.startsWith('/_next/static/');
}

function isBookContent(pathname) {
  return pathname.includes('/content');
}

function isApiRequest(pathname) {
  return pathname.startsWith('/api/');
}

function isImageRequest(pathname) {
  return /\.(png|jpg|jpeg|gif|webp|avif|svg)$/i.test(pathname);
}

// --- Mutation Queue ---

async function queueAndRespond(request) {
  try {
    const body = await request.text();
    const queueItem = {
      url: request.url,
      method: request.method,
      body,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
    };

    const db = await openDB();
    const tx = db.transaction('mutations', 'readwrite');
    const store = tx.objectStore('mutations');
    await wrapRequest(store.add(queueItem));

    // Notify clients about queued item
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'MUTATION_QUEUED', url: request.url, method: request.method });
    });

    return new Response(JSON.stringify({ success: true, queued: true, message: 'Saved offline. Will sync when you\'re back online.' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: { code: 'QUEUE_ERROR', message: 'Could not save offline.' } }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    });
  }
}

// --- IndexedDB ---

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('readpal-offline', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'timestamp' });
      }
      if (!db.objectStoreNames.contains('bookContent')) {
        db.createObjectStore('bookContent', { keyPath: 'bookId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrapRequest(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}

// --- Message Handler ---

self.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source && event.source.url && new URL(event.source.url).origin !== location.origin) {
    return;
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Cache book content for offline reading
  if (event.data && event.data.type === 'CACHE_BOOK') {
    // Validate bookId to prevent injection
    const bookId = String(event.data.bookId || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (bookId) {
      event.waitUntil(cacheBookContent(bookId, event.data.chapters));
    }
  }

  // Clear all caches
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }

  // Get queue count
  if (event.data && event.data.type === 'GET_QUEUE_COUNT') {
    getQueueCount().then((count) => {
      event.ports[0].postMessage({ type: 'QUEUE_COUNT', count });
    });
  }
});

// --- Book Content Caching ---

async function cacheBookContent(bookId, chapters) {
  const cache = await caches.open(CONTENT_CACHE);
  const db = await openDB();

  let cached = 0;
  for (const chapter of chapters) {
    try {
      // Validate chapter ID to prevent URL injection
      const chapterId = String(chapter.id || '').replace(/[^a-zA-Z0-9-]/g, '');
      if (!chapterId) continue;
      const url = `/api/books/${bookId}/chapters/${chapterId}/content`;
      // Verify URL is same-origin
      if (new URL(url, location.origin).origin !== location.origin) continue;
      const response = await fetch(url);
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set('sw-cache-time', Date.now().toString());
        const body = await response.clone().blob();
        const cachedResponse = new Response(body, { headers, status: response.status, statusText: response.statusText });
        cache.put(url, cachedResponse);
        cached++;
      }
    } catch {
      // Skip failed chapters
    }
  }

  // Store metadata about cached book
  if (!db.objectStoreNames.contains('bookContent')) return;
  const tx = db.transaction('bookContent', 'readwrite');
  tx.objectStore('bookContent').put({
    bookId,
    chaptersCached: cached,
    totalChapters: chapters.length,
    cachedAt: Date.now(),
  });

  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'BOOK_CACHED', bookId, cached, total: chapters.length });
  });
}

// --- Background Sync ---

self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-mutations') {
    event.waitUntil(retryQueuedMutations());
  }
});

async function getQueueCount() {
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readonly');
    const store = tx.objectStore('mutations');
    const count = await wrapRequest(store.count());
    return count;
  } catch {
    return 0;
  }
}

async function retryQueuedMutations() {
  const db = await openDB();
  const tx = db.transaction('mutations', 'readonly');
  const store = tx.objectStore('mutations');
  const items = await wrapRequest(store.getAll());

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });

      if (response.ok) {
        // Success — remove from queue
        const deleteTx = db.transaction('mutations', 'readwrite');
        deleteTx.objectStore('mutations').delete(item.timestamp);
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Notify clients about sync results
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      succeeded,
      failed,
      total: items.length,
    });
  });
}

// --- Periodic Background Sync (if supported) ---
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(retryQueuedMutations());
  }
});
