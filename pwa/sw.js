/* Expenses PWA service worker.
   Registered from the app root as ../sw.js (importScripts) so the
   scope covers index.html. If this file is registered directly,
   it still resolves assets relative to the app root. */
/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'expenses-pwa-v3';

function appRoot() {
  const url = new URL(self.location.href);
  // Registered script is either /sw.js or /.../sw.js or /pwa/sw.js
  if (url.pathname.endsWith('/pwa/sw.js')) {
    return new URL('../', url);
  }
  return new URL('./', url);
}

const ROOT = appRoot();
const PRECACHE = [
  new URL('index.html', ROOT).href,
  new URL('firebase-config.js', ROOT).href,
  new URL('google-drive-config.js', ROOT).href,
  new URL('js/cloud.js', ROOT).href,
  new URL('js/drive.js', ROOT).href,
  new URL('vendor/firebase.js', ROOT).href,
  new URL('pwa/manifest.webmanifest', ROOT).href,
  new URL('pwa/icon-192.png', ROOT).href,
  new URL('pwa/icon-512.png', ROOT).href,
  new URL('pwa/icon-192-maskable.png', ROOT).href,
  new URL('pwa/icon-512-maskable.png', ROOT).href,
  new URL('favicon.ico', ROOT).href
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const isNavigate = req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html');

    if (isNavigate) {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          cache.put(new URL('index.html', ROOT).href, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return (await cache.match(new URL('index.html', ROOT).href, { ignoreSearch: true })) ||
          (await cache.match(req)) ||
          Response.error();
      }
    }

    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
