/* AfricaLatency PWA service worker.
 * Public shell only: never cache API responses, authentication pages, reports,
 * dashboard HTML, scan results, or cross-origin content.
 */
'use strict';

const CACHE_NAME = 'africalatency-shell-v1';
const OFFLINE_URL = '/offline.html';
const STATIC_EXTENSIONS = /\.(?:css|js|png|jpe?g|svg|webp|ico|woff2?|ttf|otf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([
        OFFLINE_URL,
        '/images/web-app-manifest-192x192.png',
        '/images/web-app-manifest-512x512.png'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response('You are offline. Reconnect and try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
    );
    return;
  }

  if (!STATIC_EXTENSIONS.test(url.pathname)) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached || Response.error();
    })
  );
});
