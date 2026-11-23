/**
 * Web3 Student Lab service worker (FE-HARD-34).
 *
 * Enables complete offline learning:
 * - App-shell precache with an offline fallback page.
 * - Runtime caches for lesson markdown/API responses and contract templates.
 * - Background Sync: when the client queues actions offline it registers the
 *   `w3sl-sync` tag; on network restoration the `sync` event tells every open
 *   client to flush its IndexedDB queue (the flush itself runs client-side
 *   because the auth token lives in localStorage, which workers cannot read).
 *
 * URL classifiers mirror `CACHE_URL_PATTERNS` in
 * `src/lib/service-worker-sync.ts` — keep the two in sync.
 */

const APP_CACHE = 'w3sl-app-v1';
const LESSONS_CACHE = 'w3sl-lessons-v1';
const TEMPLATES_CACHE = 'w3sl-templates-v1';
const SYNC_TAG = 'w3sl-sync';

const PRECACHE_URLS = ['/offline', '/offline.html', '/manifest.json'];

const LESSON_URL_PATTERNS = [
  '/learning/',
  '/api/learning',
  '/api/lessons',
  '/api/courses',
  '/courses',
  '/lessons',
  '.md',
];

const TEMPLATE_URL_PATTERNS = ['/playground', '/api/templates', '/api/playground', 'template='];

function matchesAny(url, patterns) {
  return patterns.some((pattern) => url.includes(pattern));
}

function cacheFor(url) {
  if (matchesAny(url, TEMPLATE_URL_PATTERNS)) return TEMPLATES_CACHE;
  if (matchesAny(url, LESSON_URL_PATTERNS)) return LESSONS_CACHE;
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const expected = new Set([APP_CACHE, LESSONS_CACHE, TEMPLATES_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('w3sl-') && !expected.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function offlineFallback() {
  return (
    (await caches.match('/offline')) ||
    (await caches.match('/offline.html')) ||
    new Response('Offline', { status: 503, statusText: 'Offline' })
  );
}

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineFallback();
  }
}

async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => undefined);
  // Lesson markdown must stay readable offline: serve cache first, refresh in
  // the background. If nothing is cached yet, wait for the network once.
  if (cached) {
    network.catch(() => undefined);
    return cached;
  }
  const fresh = await network;
  return fresh || offlineFallback();
}

async function handleCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return offlineFallback();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  const cacheName = cacheFor(url);
  if (cacheName === LESSONS_CACHE) {
    event.respondWith(handleStaleWhileRevalidate(request, cacheName));
    return;
  }
  if (cacheName === TEMPLATES_CACHE) {
    event.respondWith(handleCacheFirst(request, cacheName));
    return;
  }
  // Anything else passes through to the network untouched.
});

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  // The queue lives in IndexedDB but replay needs the auth token from
  // localStorage, so wake every client and let it flush client-side.
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({ type: 'FLUSH_QUEUE' }));
    })()
  );
});

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Proactive prefetch: cache lesson/template URLs visited while online so
  // they are readable offline. `{ urls: string[] }`.
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        await Promise.all(
          data.urls.slice(0, 50).map(async (url) => {
            try {
              const cacheName = cacheFor(url) || LESSONS_CACHE;
              const cache = await caches.open(cacheName);
              if (await cache.match(url)) return;
              const response = await fetch(url, { credentials: 'same-origin' });
              if (response && response.ok) await cache.put(url, response);
            } catch {
              // Prefetch is best-effort; offline fetch failures are expected.
            }
          })
        );
      })()
    );
  }
});
