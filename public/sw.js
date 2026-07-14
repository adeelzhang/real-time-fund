const CACHE_PREFIX = 'guji-static-';
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const OFFLINE_URL = '/offline.html';
const APP_SHELL = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/guji-icon-180-v2.png',
  '/guji-icon-192-v2.png',
  '/guji-icon-512-v2.png',
  '/guji-icon-512-maskable-v2.png',
  '/pwa-guide/ios-step-1.webp',
  '/pwa-guide/ios-step-2.webp',
  '/pwa-guide/ios-step-3.webp'
];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)));

  const rootResponse = await cache.match('/');
  if (!rootResponse) return;
  const html = await rootResponse.text();
  const buildAssets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^" ]*)?)"/g)].map(
    (match) => match[1]
  );
  await Promise.all([...new Set(buildAssets)].map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:css|js|png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest'
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/')) || (await cache.match(OFFLINE_URL));
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('', { status: 503, statusText: 'Service Unavailable' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticAsset(url)) event.respondWith(staleWhileRevalidate(request, event));
});
