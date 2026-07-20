// NameMasker service worker: cache-first for the site's own static assets,
// nothing else. The core shell is precached at install; heavyweight assets
// (the vendored NER model and wasm runtime) are cached the first time they
// are fetched, so the whole tool works offline after the first full visit.
// Documents, mappings, and text never touch the network.
const CACHE = 'namemasker-__CACHE_VERSION__';
const ASSETS = [
  './',
  'index.html',
  'security.html',
  'styles.css',
  'app.js',
  'ner-worker.js',
  'manifest.webmanifest',
  'icon.svg',
  'fonts/BricolageGrotesque-var.woff2',
  'fonts/PublicSans-var.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Small shell files go network-first so a deploy is picked up on the very
// next online load; the heavyweight, rarely-changing assets (model, wasm,
// fonts) stay cache-first. Offline, everything falls back to cache.
const SHELL = new Set(['/', '/index.html', '/security.html', '/styles.css', '/app.js', '/ner-worker.js', '/manifest.webmanifest']);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const putCopy = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  if (request.mode === 'navigate' || SHELL.has(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(putCopy)
        .catch(async () =>
          (await caches.match(request, { ignoreSearch: true })) ??
          (await caches.match('index.html')) ??
          Response.error(),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ??
        fetch(request)
          .then(putCopy)
          .catch(() => Response.error()),
    ),
  );
});
