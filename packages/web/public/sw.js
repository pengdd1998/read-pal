/**
 * read-pal Service Worker
 *
 * Caching strategies:
 * - Static assets (JS/CSS/fonts): Cache-first with network fallback
 * - API GET responses: Network-first with cache fallback (stale-while-revalidate)
 * - HTML pages: Network-first with cache fallback
 * - Images: Cache-first
 *
 * Features:
 * - Offline fallback page
 * - Background sync for queued mutations
 * - Automatic cleanup of old caches on activation
 */

const CACHE_NAME = 'readpal-v1';
const STATIC_CACHE = 'readpal-static-v1';
const API_CACHE = 'readpal-api-v1';
const IMAGE_CACHE = 'readpal-images-v1';
const OFFLINE_URL = '/offline';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/offline',
];

// Install — pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Some URLs may fail in dev — that's OK
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE && key !== API_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — route requests to appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations) — but queue them for background sync
  if (request.method !== 'GET') {
    // Queue mutation for retry if offline
    if (!navigator.onLine) {
      event.respondWith(
        (async () => {
          await queueMutation(request);
          return new Response(JSON.stringify({ success: true, queued: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        })()
      );
    }
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) return;

  // Route to appropriate strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isApiRequest(url.pathname)) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60));
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

/** Network-first: try network, fall back to cache, optionally revalidate */
async function networkFirstWithCache(request, cacheName, maxAgeSeconds = 30) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
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
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head>' +
      '<body style="display:flex;align-items:center;justify-content:min-height:100vh;font-family:system-ui;background:#f9fafb">' +
      '<div style="text-align:center;padding:2rem"><h1 style="font-size:1.5rem">You\'re offline</h1>' +
      '<p style="color:#6b7280">Check your connection and try again.</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// --- Helpers ---

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|eot|svg|ico|woff)$/i.test(pathname) ||
    pathname.startsWith('/_next/static/');
}

function isApiRequest(pathname) {
  return pathname.startsWith('/api/');
}

function isImageRequest(pathname) {
  return /\.(png|jpg|jpeg|gif|webp|avif|svg)$/i.test(pathname);
}

async function queueMutation(request) {
  // Store mutation in IndexedDB for background sync
  const body = await request.text();
  const queueItem = {
    url: request.url,
    method: request.method,
    body,
    headers: Object.fromEntries(request.headers.entries()),
    timestamp: Date.now(),
  };

  // Use simple localStorage queue for now (SW can't easily access IDB in respondWith)
  // The online/offline indicator component will handle retry
  const db = await openDB();
  const tx = db.transaction('mutations', 'readwrite');
  const store = tx.objectStore('mutations');
  await new Promise((resolve, reject) => {
    const req = store.add(queueItem);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('readpal-offline', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'timestamp' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Background sync — retry queued mutations when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-mutations') {
    event.waitUntil(retryQueuedMutations());
  }
});

async function retryQueuedMutations() {
  const db = await openDB();
  const tx = db.transaction('mutations', 'readwrite');
  const store = tx.objectStore('mutations');
  const items = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      // Success — remove from queue
      const deleteTx = db.transaction('mutations', 'readwrite');
      deleteTx.objectStore('mutations').delete(item.timestamp);
    } catch {
      // Still offline — keep in queue
    }
  }
}
